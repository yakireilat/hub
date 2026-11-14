import "server-only";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { createMonitor, detectService, type Monitor } from "@hub/adapter-checks";
import { createGoogleCalendar, type GoogleCalendar } from "@hub/adapter-google-calendar";
import { createMockAdapters } from "@hub/adapter-mock";
import { createN8nAdapter, createN8nClient } from "@hub/adapter-n8n";
import { nodeMetrics } from "@hub/adapter-prometheus";
import { createTailscaleReader } from "@hub/adapter-tailscale";
import {
  createHub,
  mergeServices,
  pick,
  publicStatus,
  parseHubConfig,
  serviceInputSchema,
  serviceSlug,
  uniqueServiceId,
  type ActResult,
  applySnoozes,
  buildInbox,
  type InboxPayload,
  type AutomationsPayload,
  type CalendarPayload,
  type NewEventInput,
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
import { probe } from "./probes";

/** hub.yaml from HUB_CONFIG, else HUB_DATA_DIR/hub.yaml. No file means defaults; a bad file throws. */
/** Where the hub is reached from a browser; Google's sign-in comes back here. */
export const PUBLIC_URL = (process.env.HUB_PUBLIC_URL ?? "https://hub.mesh.net").replace(/\/$/, "");

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
  /** Google Calendar, when GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET are set (connected or not). */
  calendar?: GoogleCalendar;
  /** The real n8n adapter, when N8N_API_KEY is set. */
  n8n?: ReturnType<typeof createN8nAdapter>;
  timer?: ReturnType<typeof setInterval>;
}

// One per server process; dev hot reloads keep it on globalThis so state survives.
const g = globalThis as unknown as { __hubState?: State };

function state(): State {
  if (g.__hubState) return g.__hubState;
  const config = loadConfig();
  const db = openDb();
  const services = (): ManagedService[] => mergeServices(config.services, db.services());
  const monitor = createMonitor({ services, store: db, probe });
  const mocks = createMockAdapters();
  const mockChecks = mocks.find((m) => m.id === "checks")!;
  // Real checks replace the sample ones as soon as there is one real service, from hub.yaml or the UI.
  const checks: Adapter = {
    ...monitor.adapter,
    read: () => (services().length ? monitor.adapter.read() : mockChecks.read()),
  };
  // n8n is real once N8N_API_KEY is set; until then Today keeps the sample runs.
  const apiKey = process.env.N8N_API_KEY;
  const n8n = apiKey
    ? createN8nAdapter({ client: createN8nClient({ url: config.n8n.url, apiKey }), publicUrl: config.n8n.public_url })
    : undefined;
  // Google Calendar: configured by env, connected once someone signs in on the Calendar screen.
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  const calendar =
    clientId && clientSecret
      ? createGoogleCalendar({
          clientId,
          clientSecret,
          redirectUri: `${PUBLIC_URL}/api/v1/calendar/callback`,
          tokens: { get: () => db.getSetting("google.refresh_token"), set: (v) => db.setSetting("google.refresh_token", v) },
        })
      : undefined;
  const mockCalendar = mocks.find((m) => m.id === "calendar")!;
  // Sample events until a Google account is connected; then only the real ones.
  const calendarAdapter: Adapter = {
    ...mockCalendar,
    read: () => (calendar?.connected() ? calendar.adapter.read() : mockCalendar.read()),
    act: (id, action, input) => (calendar?.connected() ? calendar.adapter.act(id, action, input) : mockCalendar.act(id, action, input)),
    commands: () => (calendar?.connected() ? (calendar.adapter.commands?.() ?? []) : (mockCalendar.commands?.() ?? [])),
  };
  const replaced = new Set(["checks", "calendar", ...(n8n ? ["n8n"] : [])]);
  const hub = createHub(
    [...mocks.filter((m) => !replaced.has(m.id)), checks, calendarAdapter, ...(n8n ? [n8n] : [])],
    config.inbox_rules,
    (items) => applySnoozes(items, db.snoozes(Date.now()), Date.now()),
  );
  g.__hubState = { hub, config, db, monitor, mockChecks, n8n, calendar };
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
  const removed = s.db
    .services()
    .filter((r) => r.deleted)
    .map(({ id, name, url, node }) => ({ id, name, url, node }));
  if (s.monitor.services().length) return { services: await s.monitor.views(), nodes: nodes(s), removed, sample: false };
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
  return { services, nodes: nodes(s), removed, sample: true };
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

/** The landing page's summary. Public (no sign-in) through nginx, so it says nothing but counts. */
export async function publicStatusPayload() {
  const s = state();
  // monitor.views() is the live list: hub.yaml plus services added here, minus ones removed here.
  return publicStatus(await s.monitor.views());
}

/** The Automations screen: n8n workflows with today's runs, or sample ones until n8n is connected. */
export async function automationsPayload(): Promise<AutomationsPayload> {
  const { n8n } = state();
  if (!n8n) return sampleAutomations();
  try {
    return await n8n.automations();
  } catch (e) {
    return { workflows: [], sample: false, error: e instanceof Error ? e.message : "n8n didn't answer" };
  }
}

export async function setWorkflowActive(id: string, active: boolean): Promise<ActResult> {
  const { n8n } = state();
  if (!n8n) return { ok: false, message: "n8n isn't connected: set N8N_API_KEY" };
  return n8n.setActive(id, active);
}

function sampleAutomations(): AutomationsPayload {
  const now = Date.now();
  const run = (id: string, status: "success" | "error", minsAgo: number, ms: number) => ({
    id,
    status,
    startedAt: now - minsAgo * 60_000,
    durationMs: ms,
    href: "https://n8n.mesh.net/home/executions",
  });
  return {
    sample: true,
    workflows: [
      { id: "1", name: "Nightly backup → B2", active: true, runsToday: 1, failedToday: 1, href: "https://n8n.mesh.net", recent: [run("88", "error", 450, 300_000)] },
      { id: "2", name: "Hub notify", active: true, runsToday: 6, failedToday: 0, href: "https://n8n.mesh.net", recent: [run("87", "success", 20, 900), run("86", "success", 140, 850)] },
      { id: "3", name: "Pi-hole daily report", active: false, runsToday: 0, failedToday: 0, href: "https://n8n.mesh.net", recent: [] },
    ],
  };
}

/** The Inbox: runs, alerts, invites and services in trouble, with the rule that routed each. */
export async function inboxPayload(): Promise<InboxPayload> {
  const s = state();
  return buildInbox(await s.hub.items(), s.config.inbox_rules);
}

export async function snoozeItem(itemId: string, until: number): Promise<ActResult> {
  if (!Number.isFinite(until) || until <= Date.now()) return { ok: false, message: "Pick a time in the future" };
  state().db.snooze(itemId, until);
  return { ok: true, message: "Snoozed" };
}

export async function unsnoozeItem(itemId: string): Promise<ActResult> {
  state().db.unsnooze(itemId);
  return { ok: true, message: "Back in the Inbox" };
}

/** The Calendar screen: a week of events, or sample ones until Google is configured and connected. */
export async function calendarPayload(): Promise<CalendarPayload> {
  const { calendar, hub } = state();
  if (calendar?.connected()) {
    try {
      return await calendar.week();
    } catch (e) {
      const message = e instanceof Error ? e.message : "Google didn't answer";
      return { ...(await sampleCalendar(hub, !!calendar)), sample: false, connected: calendar.connected(), days: [], error: message };
    }
  }
  return sampleCalendar(hub, !!calendar);
}

async function sampleCalendar(hub: Hub, configured: boolean): Promise<CalendarPayload> {
  const items = (await hub.items()).filter((i) => i.source === "calendar");
  const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
  const day = (t: number) => new Intl.DateTimeFormat("en-CA", { timeZone: tz }).format(t);
  const days = Array.from({ length: 7 }, (_, i) => {
    const date = day(Date.now() + i * 86_400_000);
    return {
      date,
      events: items
        .filter((it) => day(Date.parse(it.time)) === date)
        .map((it) => ({
          id: it.id.replace(/^calendar:/, ""),
          title: it.title,
          start: Date.parse(it.time),
          end: Date.parse(it.time) + 3_600_000,
          allDay: false,
          calendar: "sample",
          response: it.kind === "invite" ? ("needsAction" as const) : null,
          href: it.href,
        }))
        .sort((a, b) => a.start - b.start),
    };
  });
  return { connected: false, sample: true, configured, timeZone: tz, days, calendars: [{ id: "sample", name: "Sample", primary: true }] };
}

/** Google's consent page, with `nonce` as the OAuth state the callback checks; null when not configured. */
export function calendarConnectUrl(nonce: string): string | null {
  return state().calendar?.authUrl(nonce) ?? null;
}

export async function calendarCallback(code: string): Promise<void> {
  const { calendar } = state();
  if (!calendar) throw new Error("Google Calendar isn't configured: set GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET");
  await calendar.connect(code);
}

export function calendarDisconnect(): ActResult {
  state().calendar?.disconnect();
  return { ok: true, message: "Google Calendar disconnected" };
}

export async function createCalendarEvent(input: NewEventInput): Promise<ActResult> {
  const { calendar } = state();
  if (!calendar?.connected()) return { ok: false, message: "Connect Google Calendar first" };
  return calendar.createEvent(input);
}

