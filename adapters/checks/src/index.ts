import {
  serviceSlug,
  statusSince,
  summarizeUptime,
  type Adapter,
  type CheckSample,
  type Item,
  type ManagedService,
  type ServiceDef,
  type ServiceView,
  type Status,
} from "@hub/core";

export { detectService, KNOWN_APPS, toUrl } from "./detect";

type Checkable = Pick<ServiceDef, "url" | "health" | "slow_ms">;

export interface CheckResult {
  status: Exclude<Status, "info" | "idle">;
  ms: number;
  detail: string;
}

const TIMEOUT_MS = 5_000;
/** Today polls every minute; without the scheduler, one check round per 30 s is plenty. */
const MAX_AGE_MS = 30_000;
const HISTORY_MS = 7 * 24 * 3_600_000;

/** One HTTP check: any answer below 400 within slow_ms is up, slower is slow, everything else failed. */
export async function check(svc: Checkable, fetchFn: typeof fetch = fetch): Promise<CheckResult> {
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

export const slug = serviceSlug;

/** Where check results are kept. The web app backs this with SQLite; tests use memory. */
export interface CheckStore {
  record(samples: (CheckSample & { id: string })[]): void;
  /** Samples since `since` (epoch ms), oldest first, per service id. */
  history(ids: string[], since: number): Map<string, CheckSample[]>;
}

export function memoryCheckStore(): CheckStore {
  const rows = new Map<string, CheckSample[]>();
  return {
    record(samples) {
      for (const { id, ...s } of samples) rows.set(id, [...(rows.get(id) ?? []), s]);
    },
    history(ids, since) {
      return new Map(ids.map((id) => [id, (rows.get(id) ?? []).filter((s) => s.at >= since)]));
    },
  };
}

interface Latest extends CheckResult {
  at: number;
}

export interface Monitor {
  /** Checks the given services (default: all) now and records the results. */
  runRound(only?: ManagedService[]): Promise<void>;
  /** Services with their latest check and uptime history, for the Services screen. */
  views(): Promise<ServiceView[]>;
  /** The checks adapter Today and the palette read through. */
  adapter: Adapter;
  services(): ManagedService[];
}

/**
 * Runs HTTP checks for a changing list of services. A scheduler calls runRound every minute; reads in
 * between reuse the latest round, and a round older than 30 s is rerun on demand.
 */
export function createMonitor(opts: {
  services: () => ManagedService[];
  store?: CheckStore;
  fetchFn?: typeof fetch;
  now?: () => number;
}): Monitor {
  const store = opts.store ?? memoryCheckStore();
  const now = opts.now ?? Date.now;
  const latest = new Map<string, Latest>();
  let round: Promise<void> | undefined;
  let roundAt = 0;

  async function runRound(only?: ManagedService[]) {
    const list = only ?? opts.services();
    const at = now();
    const results = await Promise.all(list.map((s) => check(s, opts.fetchFn)));
    const samples = list.map((s, i) => ({ id: s.id, at, status: results[i]!.status, ms: results[i]!.ms }));
    store.record(samples);
    list.forEach((s, i) => latest.set(s.id, { ...results[i]!, at }));
    if (!only) roundAt = at;
  }

  /** Reuses a recent round; runs one when none is fresh, sharing it between concurrent readers. */
  function fresh(): Promise<void> {
    if (now() - roundAt <= MAX_AGE_MS && opts.services().every((s) => latest.has(s.id))) return Promise.resolve();
    round ??= runRound().finally(() => (round = undefined));
    return round;
  }

  async function items(): Promise<Item[]> {
    await fresh();
    return opts.services().map((svc) => {
      const r = latest.get(svc.id);
      return {
        id: `checks:${svc.id}`,
        source: "checks",
        kind: "service",
        title: svc.name,
        context: `${svc.node} · ${r?.detail ?? "Not checked yet"}`,
        time: new Date(r?.at ?? now()).toISOString(),
        status: r?.status ?? "idle",
        route: "fyi",
        actions: [],
        href: svc.url,
        meta: { ms: r?.ms ?? 0, node: svc.node },
      };
    });
  }

  return {
    runRound,
    services: opts.services,
    async views() {
      await fresh();
      const list = opts.services();
      const t = now();
      const hist = store.history(
        list.map((s) => s.id),
        t - HISTORY_MS,
      );
      return list.map((svc) => {
        const r = latest.get(svc.id);
        const samples = hist.get(svc.id) ?? [];
        const run = r ? statusSince(samples, r.status) : null;
        return {
          ...svc,
          status: r?.status ?? "idle",
          detail: r?.detail ?? "Not checked yet",
          ms: r?.ms ?? null,
          checkedAt: r?.at ?? null,
          since: run?.since ?? null,
          // Only "at least" once history is nearly full; a new service's whole history is its real age.
          sinceAtLeast: !!run?.whole && t - run.since > HISTORY_MS - 86_400_000,
          history: summarizeUptime(samples, t),
        };
      });
    },
    adapter: {
      id: "checks",
      name: "Checks",
      read: items,
      async act() {
        return { ok: false, message: "Checks have no actions" };
      },
      link: (item) => item.href,
    },
  };
}

/** Checks a fixed list of hub.yaml services, without stored history. */
export function createChecksAdapter(
  services: Omit<ServiceDef, "id">[],
  fetchFn: typeof fetch = fetch,
): Adapter {
  const managed = services.map((s) => ({ ...s, id: serviceSlug(s.name), origin: "yaml" as const }));
  return createMonitor({ services: () => managed, fetchFn }).adapter;
}
