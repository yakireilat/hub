import type { Adapter, HubConfig, Item, Status } from "@hub/core";

type Service = HubConfig["services"][number];

export interface CheckResult {
  status: Status;
  ms: number;
  detail: string;
}

const TIMEOUT_MS = 5_000;
/** Today polls every minute; one check round per 30 s is plenty and keeps the services idle. */
const MAX_AGE_MS = 30_000;

/** One HTTP check: any answer below 400 within slow_ms is up, slower is slow, everything else failed. */
export async function check(svc: Service, fetchFn: typeof fetch = fetch): Promise<CheckResult> {
  const start = performance.now();
  const elapsed = () => Math.round(performance.now() - start);
  try {
    // Redirects count as an answer: a login redirect still proves the service is listening.
    const res = await fetchFn(svc.health ?? svc.url, {
      redirect: "manual",
      cache: "no-store",
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    const ms = elapsed();
    if (res.status >= 400) return { status: "failed", ms, detail: `HTTP ${res.status}` };
    return { status: ms > svc.slow_ms ? "slow" : "up", ms, detail: `${ms.toLocaleString("en")} ms` };
  } catch (e) {
    const timedOut = e instanceof Error && e.name === "TimeoutError";
    return { status: "failed", ms: elapsed(), detail: timedOut ? `No answer in ${TIMEOUT_MS / 1000} s` : "Unreachable" };
  }
}

export const slug = (name: string) => name.toLowerCase().replace(/\W+/g, "-");

/** Checks every service in hub.yaml. Failed services stay FYI unless an inbox rule routes them. */
export function createChecksAdapter(services: Service[], fetchFn: typeof fetch = fetch): Adapter {
  let last: { at: number; items: Promise<Item[]> } | undefined;

  async function run(): Promise<Item[]> {
    const time = new Date().toISOString();
    const results = await Promise.all(services.map((s) => check(s, fetchFn)));
    return services.map((svc, i) => {
      const r = results[i]!;
      return {
        id: `checks:${slug(svc.name)}`,
        source: "checks",
        kind: "service",
        title: svc.name,
        context: `${svc.node} · ${r.detail}`,
        time,
        status: r.status,
        route: "fyi",
        actions: [],
        href: svc.url,
        meta: { ms: r.ms, node: svc.node },
      };
    });
  }

  return {
    id: "checks",
    name: "Checks",
    read() {
      if (!last || Date.now() - last.at > MAX_AGE_MS) last = { at: Date.now(), items: run() };
      return last.items;
    },
    async act() {
      return { ok: false, message: "Checks have no actions" };
    },
    link: (item) => item.href,
  };
}
