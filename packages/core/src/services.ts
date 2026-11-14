import { z } from "zod";
import type { Status } from "./status";

/** A monitored service, from hub.yaml or added in the UI. `id` is stable once created. */
export interface ServiceDef {
  id: string;
  name: string;
  url: string;
  health?: string;
  node: string;
  slow_ms: number;
}

/** yaml = defined in hub.yaml (removing it only hides it); ui = added on the Services screen. */
export type ServiceOrigin = "yaml" | "ui";

export interface ManagedService extends ServiceDef {
  origin: ServiceOrigin;
}

/** A row in the hub's database: a UI-added service, or an edit or removal of a hub.yaml one. */
export interface StoredService extends ServiceDef {
  origin: ServiceOrigin;
  deleted: boolean;
}

/** What a person types in the add or edit form. */
export const serviceInputSchema = z.object({
  name: z.string().trim().min(1, "Give it a name").max(60),
  url: z.string().trim().url("Use a full address, like https://git.mesh.net"),
  health: z
    .string()
    .trim()
    .url("Use a full address for the health check")
    .optional()
    .or(z.literal("").transform(() => undefined)),
  node: z.string().trim().min(1).max(40).default("core-01"),
  slow_ms: z.coerce.number().int().min(100).max(30_000).default(1500),
});
export type ServiceInput = z.input<typeof serviceInputSchema>;

export const serviceSlug = (name: string) =>
  name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "") || "service";

/** A slug for `name` that no existing service uses yet. */
export function uniqueServiceId(name: string, taken: Iterable<string>): string {
  const used = new Set(taken);
  const base = serviceSlug(name);
  let id = base;
  for (let n = 2; used.has(id); n++) id = `${base}-${n}`;
  return id;
}

/** hub.yaml services, with database rows layered on top: edits replace, removals hide, UI rows append. */
export function mergeServices(yaml: Omit<ServiceDef, "id">[], rows: StoredService[]): ManagedService[] {
  const byId = new Map(rows.map((r) => [r.id, r]));
  const out: ManagedService[] = [];
  const yamlIds = new Set<string>();
  for (const svc of yaml) {
    const id = serviceSlug(svc.name);
    yamlIds.add(id);
    const row = byId.get(id);
    if (row?.deleted) continue;
    out.push(row ? { ...strip(row), origin: "yaml" } : { ...svc, id, origin: "yaml" });
  }
  for (const row of rows) {
    if (row.origin === "ui" && !row.deleted && !yamlIds.has(row.id)) out.push({ ...strip(row), origin: "ui" });
  }
  return out;
}

function strip(row: StoredService): ServiceDef {
  const { id, name, url, health, node, slow_ms } = row;
  return { id, name, url, ...(health ? { health } : {}), node, slow_ms };
}

/** One stored check result. `at` is epoch milliseconds. */
export interface CheckSample {
  at: number;
  status: Exclude<Status, "info" | "idle">;
  ms: number;
}

export interface UptimeBucket {
  /** Start of the bucket, epoch ms. */
  start: number;
  /** Worst status seen in the bucket; null when there were no checks. */
  status: CheckSample["status"] | null;
  checks: number;
  failed: number;
}

export interface UptimeSummary {
  buckets: UptimeBucket[];
  /** Share of checks that answered (up or slow), 0–1; null without data. */
  uptime24h: number | null;
  uptime7d: number | null;
  /** Failed checks in the last 24 h. */
  failures24h: number;
}

const HOUR = 3_600_000;

/** Hourly buckets for the last 24 h (oldest first) plus uptime shares, from raw samples. */
export function summarizeUptime(samples: CheckSample[], now: number, hours = 24): UptimeSummary {
  const end = Math.floor(now / HOUR) * HOUR + HOUR;
  const start = end - hours * HOUR;
  const buckets: UptimeBucket[] = Array.from({ length: hours }, (_, i) => ({
    start: start + i * HOUR,
    status: null,
    checks: 0,
    failed: 0,
  }));
  let day = 0;
  let dayUp = 0;
  let week = 0;
  let weekUp = 0;
  let failures24h = 0;
  for (const s of samples) {
    const answered = s.status !== "failed";
    if (s.at >= now - 7 * 24 * HOUR) {
      week++;
      if (answered) weekUp++;
    }
    if (s.at >= now - 24 * HOUR) {
      day++;
      if (answered) dayUp++;
      else failures24h++;
    }
    const b = buckets[Math.floor((s.at - start) / HOUR)];
    if (!b) continue;
    b.checks++;
    if (!answered) b.failed++;
    b.status = worse(b.status, s.status);
  }
  return {
    buckets,
    uptime24h: day ? dayUp / day : null,
    uptime7d: week ? weekUp / week : null,
    failures24h,
  };
}

const RANK = { up: 0, slow: 1, failed: 2 } as const;
function worse(a: UptimeBucket["status"], b: CheckSample["status"]): CheckSample["status"] {
  return a && RANK[a] >= RANK[b] ? a : b;
}

/**
 * When the current status began: the oldest sample of the unbroken run of `status` that ends with
 * the newest sample. `whole` is true when that run reaches the oldest sample kept, so it may be longer.
 */
export function statusSince(samples: CheckSample[], status: Status): { since: number; whole: boolean } | null {
  let i = samples.length - 1;
  if (i < 0 || samples[i]!.status !== status) return null;
  while (i > 0 && samples[i - 1]!.status === status) i--;
  return { since: samples[i]!.at, whole: i === 0 };
}

/** A service as the Services screen shows it: definition, latest check and history. */
export interface ServiceView extends ManagedService {
  status: Status;
  detail: string;
  ms: number | null;
  /** Epoch ms of the latest check; null before the first one. */
  checkedAt: number | null;
  /** Epoch ms when the current status began, as far as history goes back; null without history. */
  since: number | null;
  /** True when the current status covers all stored history, so it started at least that long ago. */
  sinceAtLeast: boolean;
  history: UptimeSummary;
}

/**
 * The landing page's summary, in the shape mesh-dashboard served: answering services out of every
 * service the hub monitors right now (services removed on the Services screen aren't monitored).
 */
export function publicStatus(views: Pick<ServiceView, "status">[]) {
  const up = views.filter((v) => v.status === "up" || v.status === "slow").length;
  return { up, total: views.length, nominal: views.length > 0 && up === views.length };
}

export interface ServicesPayload {
  services: ServiceView[];
  nodes: string[];
  /** Services removed on the Services screen; they stay restorable from the Add panel. */
  removed: Pick<ServiceDef, "id" | "name" | "url" | "node">[];
  /** True while no real services are configured and the screen shows sample data. */
  sample: boolean;
}

/** What smart add proposes for a typed name or address. Nothing is saved until the person confirms. */
export interface ServiceSuggestion {
  name: string;
  url: string;
  health?: string;
  node: string;
  slow_ms: number;
  /** The app it recognised, e.g. "Jellyfin". */
  known?: string;
  /** Whether the address answered when probed; null when it could not be probed. */
  reachable: boolean | null;
  /** Name of an existing service with the same address or name. */
  duplicateOf?: string;
  notes: string[];
}
