import type { ManagedService, ServiceSuggestion } from "@hub/core";

/** Apps the hub recognises, with the health endpoint each one answers on without signing in. */
interface KnownApp {
  name: string;
  /** Matched against the address's host labels, the typed text and the page title. */
  match: RegExp;
  health: string;
}

export const KNOWN_APPS: KnownApp[] = [
  { name: "n8n", match: /\bn8n\b|\bflow\b/, health: "/healthz" },
  { name: "Gitea", match: /\bgitea\b|\bgit\b|\bsource\b/, health: "/api/healthz" },
  { name: "Vaultwarden", match: /vaultwarden|bitwarden|\bvault\b/, health: "/alive" },
  { name: "Uptime Kuma", match: /uptime.?kuma|\bstatus\b/, health: "/" },
  { name: "Pi-hole", match: /pi.?hole|\bdns\b|\bresolve\b/, health: "/admin/" },
  { name: "Authelia", match: /authelia|\bauth\b/, health: "/api/health" },
  { name: "Grafana", match: /grafana|\bmetrics\b/, health: "/api/health" },
  { name: "Prometheus", match: /prometheus|\bprom\b/, health: "/-/healthy" },
  { name: "Syncthing", match: /syncthing|\bsync\b/, health: "/rest/noauth/health" },
  { name: "code-server", match: /code.?server|\bcode\b|\bdev\b/, health: "/healthz" },
  { name: "Woodpecker CI", match: /woodpecker|\bci\b/, health: "/healthz" },
  { name: "ntfy", match: /\bntfy\b/, health: "/v1/health" },
  { name: "Jellyfin", match: /jellyfin|\bmedia\b/, health: "/health" },
  { name: "Jellyseerr", match: /jellyseerr|overseerr|\brequest\b/, health: "/api/v1/status" },
  { name: "Sonarr", match: /sonarr/, health: "/ping" },
  { name: "Radarr", match: /radarr/, health: "/ping" },
  { name: "Prowlarr", match: /prowlarr/, health: "/ping" },
  { name: "Bazarr", match: /bazarr/, health: "/ping" },
  { name: "Lidarr", match: /lidarr/, health: "/ping" },
  { name: "qBittorrent", match: /qbittorrent|\btorrent\b/, health: "/" },
  { name: "Dozzle", match: /dozzle/, health: "/healthcheck" },
  { name: "Home Assistant", match: /home.?assistant|\bhass\b|\bha\b/, health: "/manifest.json" },
  { name: "Immich", match: /immich|\bphotos\b/, health: "/api/server/ping" },
  { name: "Paperless-ngx", match: /paperless/, health: "/" },
  { name: "Miniflux", match: /miniflux|\bfeeds?\b/, health: "/healthcheck" },
  { name: "Vikunja", match: /vikunja|\btasks\b/, health: "/api/v1/info" },
  { name: "Actual Budget", match: /actual/, health: "/" },
  { name: "Karakeep", match: /karakeep|hoarder/, health: "/api/health" },
  { name: "SearXNG", match: /searxng|\bsearch\b/, health: "/healthz" },
  { name: "Ollama", match: /ollama/, health: "/api/version" },
  { name: "Portainer", match: /portainer/, health: "/api/system/status" },
  { name: "Nextcloud", match: /nextcloud/, health: "/status.php" },
];

const PROBE_TIMEOUT_MS = 4_000;

function findKnown(...texts: string[]): KnownApp | undefined {
  const hay = texts.join(" ").toLowerCase();
  return KNOWN_APPS.find((a) => a.match.test(hay));
}

/** The domain most existing services live under, e.g. "mesh.net", so a bare name can become an address. */
export function commonDomain(existing: Pick<ManagedService, "url">[]): string | undefined {
  const counts = new Map<string, number>();
  for (const s of existing) {
    try {
      const host = new URL(s.url).hostname;
      if (/^[\d.]+$/.test(host)) continue;
      const domain = host.split(".").slice(1).join(".");
      if (domain.includes(".")) counts.set(domain, (counts.get(domain) ?? 0) + 1);
    } catch {
      // A malformed stored address just doesn't vote.
    }
  }
  return [...counts].sort((a, b) => b[1] - a[1])[0]?.[0];
}

/** Turns "jellyfin", "media.mesh.net" or "http://10.0.0.5:8096" into a full address. */
export function toUrl(input: string, existing: Pick<ManagedService, "url">[]): URL {
  const text = input.trim();
  if (/^https?:\/\//i.test(text)) return new URL(text);
  if (/^[\w-]+$/.test(text)) {
    const domain = commonDomain(existing);
    if (domain) return new URL(`https://${text.toLowerCase()}.${domain}`);
  }
  if (/^[\d.]+(:\d+)?(\/.*)?$/.test(text)) return new URL(`http://${text}`);
  return new URL(`https://${text}`);
}

const norm = (u: string) => {
  try {
    const x = new URL(u);
    return `${x.protocol}//${x.host}${x.pathname.replace(/\/+$/, "")}`.toLowerCase();
  } catch {
    return u.toLowerCase();
  }
};

/** The node of an existing service on the same host, else the node most services run on. */
function guessNode(url: URL, existing: ManagedService[], nodes: string[]): string {
  const sameHost = existing.find((s) =>
    [s.url, s.health].some((u) => {
      try {
        return !!u && new URL(u).hostname === url.hostname;
      } catch {
        return false;
      }
    }),
  );
  if (sameHost) return sameHost.node;
  const counts = new Map<string, number>();
  for (const s of existing) counts.set(s.node, (counts.get(s.node) ?? 0) + 1);
  return [...counts].sort((a, b) => b[1] - a[1])[0]?.[0] ?? nodes[0] ?? "core-01";
}

async function probe(url: string, fetchFn: typeof fetch) {
  const start = performance.now();
  try {
    const res = await fetchFn(url, { redirect: "manual", cache: "no-store", signal: AbortSignal.timeout(PROBE_TIMEOUT_MS) });
    const ms = Math.round(performance.now() - start);
    const type = res.headers.get("content-type") ?? "";
    const html = res.status < 300 && type.includes("html") ? (await res.text()).slice(0, 20_000) : "";
    const title = /<title[^>]*>([^<]{1,120})<\/title>/i.exec(html)?.[1]?.trim();
    return { status: res.status, ms, title, location: res.headers.get("location") ?? undefined };
  } catch {
    return null;
  }
}

const titleCase = (s: string) => s.replace(/(^|[-_ ])(\w)/g, (_, sep: string, c: string) => (sep ? " " : "") + c.toUpperCase());

/**
 * Smart add: works out a name, address, health check and node from whatever was typed, probing the
 * address once. It never saves anything; the person confirms the suggestion first.
 */
export async function detectService(
  input: string,
  existing: ManagedService[],
  nodes: string[],
  /** null skips probing (the static demo has no server to probe from). */
  fetchFn: typeof fetch | null = fetch,
): Promise<ServiceSuggestion> {
  const url = toUrl(input, existing);
  const notes: string[] = [];
  const firstLabel = url.hostname.split(".")[0] ?? url.hostname;

  let known = findKnown(input, url.hostname.replace(/\./g, " "));
  const page = fetchFn ? await probe(url.href, fetchFn) : null;
  if (!known && page?.title) known = findKnown(page.title);

  if (!fetchFn) notes.push("Not probed: the address is only checked once the service is saved.");
  else if (!page) notes.push("The address didn't answer from the hub, so check it before saving.");
  else if (page.status >= 300 && page.status < 400 && page.location && /auth|login|sso/i.test(page.location)) {
    notes.push("It redirects to a sign-in page, so a check here only proves nginx answers. Use the app's internal address as the health check if you can.");
  } else if (page.status >= 400) notes.push(`It answered HTTP ${page.status}.`);

  let health: string | undefined;
  if (known && known.health !== "/") {
    health = new URL(known.health, url).href;
    const h = page && fetchFn ? await probe(health, fetchFn) : null;
    if (h && h.status >= 400) {
      notes.push(`${known.name}'s health endpoint answered HTTP ${h.status}; the hub will check the main address instead.`);
      health = undefined;
    }
  }

  let slow_ms = 1500;
  if (page && page.ms > 750) {
    slow_ms = Math.min(30_000, Math.ceil((page.ms * 2) / 500) * 500);
    notes.push(`It took ${page.ms.toLocaleString("en")} ms to answer, so "slow" starts at ${slow_ms.toLocaleString("en")} ms.`);
  }

  const name = known?.name ?? (page?.title && page.title.length <= 40 ? page.title : titleCase(firstLabel));
  const dup = existing.find(
    (s) => norm(s.url) === norm(url.href) || s.name.toLowerCase() === name.toLowerCase(),
  );

  return {
    name,
    url: url.href.replace(/\/$/, ""),
    ...(health ? { health } : {}),
    node: guessNode(url, existing, nodes),
    slow_ms,
    ...(known ? { known: known.name } : {}),
    reachable: fetchFn ? !!page && page.status < 400 : null,
    ...(dup ? { duplicateOf: dup.name } : {}),
    notes,
  };
}
