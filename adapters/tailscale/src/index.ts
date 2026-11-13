import { nodeKey, type NodePresence } from "@hub/core";

const API = "https://api.tailscale.com/api/v2";
/** A device counts as online when the coordination server saw it this recently. */
const ONLINE_WINDOW_MS = 5 * 60_000;

interface Device {
  name?: string;
  hostname?: string;
  addresses?: string[];
  os?: string;
  lastSeen?: string;
  connectedToControl?: boolean;
}

/**
 * Reads tailnet devices with an OAuth client (scope: devices:core:read). Tokens last an hour and are
 * reused; unlike API keys, the client itself never expires.
 */
export function createTailscaleReader(opts: {
  clientId: string;
  clientSecret: string;
  fetchFn?: typeof fetch;
  now?: () => number;
}) {
  const fetchFn = opts.fetchFn ?? fetch;
  const now = opts.now ?? Date.now;
  let token: { value: string; until: number } | undefined;

  async function accessToken(): Promise<string> {
    if (token && token.until > now() + 60_000) return token.value;
    const res = await fetchFn(`${API}/oauth/token`, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ client_id: opts.clientId, client_secret: opts.clientSecret }),
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) throw new Error(`Tailscale token request answered HTTP ${res.status}`);
    const body = (await res.json()) as { access_token: string; expires_in?: number };
    token = { value: body.access_token, until: now() + (body.expires_in ?? 3600) * 1000 };
    return token.value;
  }

  /** Presence per machine, keyed by its short lower-case name (hostname and MagicDNS name both). */
  async function presence(): Promise<Map<string, NodePresence>> {
    const res = await fetchFn(`${API}/tailnet/-/devices?fields=all`, {
      headers: { authorization: `Bearer ${await accessToken()}` },
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) throw new Error(`Tailscale devices request answered HTTP ${res.status}`);
    const { devices } = (await res.json()) as { devices: Device[] };
    const out = new Map<string, NodePresence>();
    for (const d of devices) {
      const lastSeen = d.lastSeen ? Date.parse(d.lastSeen) : null;
      const p: NodePresence = {
        online: d.connectedToControl ?? (lastSeen !== null && now() - lastSeen < ONLINE_WINDOW_MS),
        lastSeen,
        ...(d.addresses?.[0] ? { address: d.addresses[0] } : {}),
        ...(d.os ? { os: d.os } : {}),
      };
      for (const n of [d.name, d.hostname]) if (n) out.set(nodeKey(n), p);
    }
    return out;
  }

  return { presence };
}
