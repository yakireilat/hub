import "server-only";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { createMonitor, detectService, type Monitor } from "@hub/adapter-checks";
import { createMockAdapters } from "@hub/adapter-mock";
import { nodeMetrics } from "@hub/adapter-prometheus";
import { createTailscaleReader } from "@hub/adapter-tailscale";
import {
  createHub,
  mergeServices,
  pick,
  parseHubConfig,
  serviceInputSchema,
  serviceSlug,
  uniqueServiceId,
  type ActResult,
  type Adapter,
  type Hub,
  type HubConfig,
  type ManagedService,
  type NodesPayload,
  type NodeView,
  type ServiceInput,
  type ServiceSuggestion,
  type ServicesPayload,
  type ServiceView,
} from "@hub/core";
import { openDb, type HubDb } from "./db";

/** hub.yaml from HUB_CONFIG, else HUB_DATA_DIR/hub.yaml. No file means defaults; a bad file throws. */
export function loadConfig(): HubConfig {
  const file = process.env.HUB_CONFIG ?? path.join(process.env.HUB_DATA_DIR ?? "./data", "hub.yaml");
  return parseHubConfig(existsSync(file) ? readFileSync(file, "utf8") : "");
}

interface State {
  hub: Hub;
  config: HubConfig;
  db: HubDb;
  monitor: Monitor;
  mockChecks: Adapter;
  timer?: ReturnType<typeof setInterval>;
}

// One per server process; dev hot reloads keep it on globalThis so state survives.
const g = globalThis as unknown as { __hubState?: State };

function state(): State {
  if (g.__hubState) return g.__hubState;
  const config = loadConfig();
  const db = openDb();
  const services = (): ManagedService[] => mergeServices(config.services, db.services());
  const monitor = createMonitor({ services, store: db });
  const mocks = createMockAdapters();
  const mockChecks = mocks.find((m) => m.id === "checks")!;
  // Real checks replace the sample ones as soon as there is one real service, from hub.yaml or the UI.
  const checks: Adapter = {
    ...monitor.adapter,
    read: () => (services().length ? monitor.adapter.read() : mockChecks.read()),
  };
  const hub = createHub([...mocks.filter((m) => m.id !== "checks"), checks], config.inbox_rules);
  g.__hubState = { hub, config, db, monitor, mockChecks };
  return g.__hubState;
}

export const getHub = (): Hub => state().hub;

const HISTORY_DAYS = Number(process.env.HUB_HISTORY_DAYS) || 7;
const INTERVAL_S = Number(process.env.HUB_CHECK_INTERVAL_S) || 60;

/** Checks every service each minute and keeps HUB_HISTORY_DAYS of results. Called once at server start. */
export function startScheduler() {
  const s = state();
  if (s.timer) return;
  let ticks = 0;
  const tick = async () => {
    try {
      if (s.monitor.services().length) await s.monitor.runRound();
      // Prune about once an hour.
      if (ticks++ % Math.max(1, Math.round(3600 / INTERVAL_S)) === 0) s.db.prune(Date.now() - HISTORY_DAYS * 86_400_000);
    } catch (e) {
      console.error("check round failed", e);
    }
  };
  s.timer = setInterval(tick, INTERVAL_S * 1000);
  s.timer.unref?.();
  void tick();
}

function nodes(s: State): string[] {
  const ids = [...s.config.nodes.map((n) => n.id), ...s.monitor.services().map((x) => x.node)];
  return [...new Set(ids.length ? ids : ["core-01"])];
}

export async function servicesPayload(): Promise<ServicesPayload> {
  const s = state();
  if (s.monitor.services().length) return { services: await s.monitor.views(), nodes: nodes(s), sample: false };
  // No real services yet: show the sample ones so the screen isn't empty, without history.
  const items = await s.mockChecks.read();
  const services: ServiceView[] = items.map((i) => ({
    id: i.id.replace(/^checks:/, ""),
    name: i.title,
    url: i.href,
    node: String(i.meta?.node ?? "core-01"),
    slow_ms: 1500,
    origin: "yaml",
    status: i.status,
    detail: i.context.split(" · ").slice(1).join(" · "),
    ms: Number(i.meta?.ms ?? 0),
    checkedAt: Date.parse(i.time),
    since: null,
    sinceAtLeast: false,
    history: { buckets: [], uptime24h: null, uptime7d: null, failures24h: 0 },
  }));
  return { services, nodes: nodes(s), sample: true };
}

export async function suggestService(input: string): Promise<ServiceSuggestion> {
  const s = state();
  return detectService(input, s.monitor.services(), nodes(s));
}

type SaveResult = ActResult & { service?: ServiceView; errors?: Record<string, string> };

function parse(input: ServiceInput): { ok: true; data: ReturnType<typeof serviceInputSchema.parse> } | { ok: false; result: SaveResult } {
  const parsed = serviceInputSchema.safeParse(input);
  if (parsed.success) return { ok: true, data: parsed.data };
  const errors = Object.fromEntries(parsed.error.issues.map((i) => [String(i.path[0] ?? "form"), i.message]));
  return { ok: false, result: { ok: false, message: Object.values(errors)[0] ?? "Check the form", errors } };
}

async function checkNow(s: State, id: string): Promise<ServiceView | undefined> {
  const svc = s.monitor.services().find((x) => x.id === id);
  if (svc) await s.monitor.runRound([svc]);
  return (await s.monitor.views()).find((v) => v.id === id);
}

export async function addService(input: ServiceInput): Promise<SaveResult> {
  const p = parse(input);
  if (!p.ok) return p.result;
  const s = state();
  const taken = [...s.db.services().map((r) => r.id), ...s.config.services.map((y) => serviceSlug(y.name))];
  const id = uniqueServiceId(p.data.name, taken);
  s.db.saveService({ ...p.data, id, origin: "ui", deleted: false });
  return { ok: true, message: `Added ${p.data.name}`, service: await checkNow(s, id) };
}

export async function updateService(id: string, input: ServiceInput): Promise<SaveResult> {
  const p = parse(input);
  if (!p.ok) return p.result;
  const s = state();
  const current = s.monitor.services().find((x) => x.id === id);
  if (!current) return { ok: false, message: "That service no longer exists" };
  // An edited hub.yaml service keeps its id and origin, so removing the edit later is still possible.
  s.db.saveService({ ...p.data, id, origin: current.origin, deleted: false });
  return { ok: true, message: `Saved ${p.data.name}`, service: await checkNow(s, id) };
}

export function removeService(id: string): ActResult {
  const s = state();
  const current = s.monitor.services().find((x) => x.id === id);
  if (!current) return { ok: false, message: "That service no longer exists" };
  // A hub.yaml service needs a row to stay hidden; a UI one already has its row.
  if (current.origin === "yaml" && !s.db.services().some((r) => r.id === id)) {
    s.db.saveService({ ...current, deleted: true });
  } else s.db.setDeleted(id, true);
  return { ok: true, message: `Removed ${current.name}` };
}

export function restoreService(id: string): ActResult {
  const s = state();
  const row = s.db.services().find((r) => r.id === id);
  if (!row?.deleted) return { ok: false, message: "Nothing to restore" };
  s.db.setDeleted(id, false);
  return { ok: true, message: `Restored ${row.name}` };
}

type Presence = Awaited<ReturnType<ReturnType<typeof createTailscaleReader>["presence"]>>;
const NODES_MAX_AGE_MS = 30_000;
const n = globalThis as unknown as { __hubNodes?: { at: number; value: Promise<NodesPayload> }; __hubTs?: ReturnType<typeof createTailscaleReader> };

/** Tailscale is optional: on when TS_API_CLIENT_ID and TS_API_CLIENT_SECRET are set. */
function tailscale() {
  const clientId = process.env.TS_API_CLIENT_ID;
  const clientSecret = process.env.TS_API_CLIENT_SECRET;
  if (!clientId || !clientSecret) return undefined;
  n.__hubTs ??= createTailscaleReader({ clientId, clientSecret });
  return n.__hubTs;
}

/** Node tiles: configured nodes with tailnet presence and node-exporter metrics, cached for 30 s. */
export function nodesPayload(): Promise<NodesPayload> {
  if (n.__hubNodes && Date.now() - n.__hubNodes.at < NODES_MAX_AGE_MS) return n.__hubNodes.value;
  const value = buildNodes();
  n.__hubNodes = { at: Date.now(), value };
  // A failed build shouldn't be served for 30 s.
  value.catch(() => (n.__hubNodes = undefined));
  return value;
}

async function buildNodes(): Promise<NodesPayload> {
  const s = state();
  const ts = tailscale();
  const prom = s.config.prometheus;
  if (!s.monitor.services().length && !s.config.nodes.length && !ts && !prom) return sampleNodes();

  const [presence, metrics, views] = await Promise.all([
    ts ? ts.presence().catch((e: unknown) => e as Error) : undefined,
    prom ? nodeMetrics(prom).catch((e: unknown) => e as Error) : undefined,
    s.monitor.views(),
  ]);
  if (presence instanceof Error) console.error("tailscale:", presence.message);
  if (metrics instanceof Error) console.error("prometheus:", metrics.message);
  const cfg = new Map(s.config.nodes.map((c) => [c.id, c]));

  const list: NodeView[] = nodes(s).map((id) => {
    const c = cfg.get(id);
    const mine = views.filter((v) => v.node === id);
    return {
      id,
      presence: presence instanceof Map ? (pick(presence as Presence, id, c?.tailscale) ?? null) : null,
      metrics: metrics && !(metrics instanceof Error) ? (pick(metrics.byName, id, c?.instance) ?? null) : null,
      services: mine.length,
      failing: mine.filter((v) => v.status === "failed").length,
    };
  });
  const sourceState = (x: unknown) => (x === undefined ? "off" : x instanceof Error ? "error" : "ok") as "off" | "error" | "ok";
  const used = new Set(list.map((x) => x.metrics));
  const unmatchedExporters =
    metrics && !(metrics instanceof Error)
      ? metrics.exporters.filter((e) => !used.has(e.metrics)).map(({ instance, hostname }) => ({ instance, hostname }))
      : [];
  return {
    nodes: list,
    sources: { tailscale: sourceState(presence), prometheus: sourceState(metrics) },
    unmatchedExporters,
    sample: false,
  };
}

function sampleNodes(): NodesPayload {
  const now = Date.now();
  return {
    sample: true,
    sources: { tailscale: "off", prometheus: "off" },
    unmatchedExporters: [],
    nodes: [
      {
        id: "core-01",
        presence: { online: true, lastSeen: now, address: "100.100.101.1", os: "linux" },
        metrics: { cpu: 34, memory: 71, memoryTotalBytes: 8.2e9, disk: 18, tempC: 52 },
        services: 5,
        failing: 0,
      },
      {
        id: "niflheim",
        presence: { online: false, lastSeen: now - 3 * 3_600_000, address: "100.100.101.100", os: "windows" },
        metrics: null,
        services: 0,
        failing: 0,
      },
    ],
  };
}
