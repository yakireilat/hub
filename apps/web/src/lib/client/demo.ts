import { createMonitor, detectService } from "@hub/adapter-checks";
import { createMockAdapters } from "@hub/adapter-mock";
import {
  applySnoozes,
  buildInbox,
  createHub,
  serviceInputSchema,
  uniqueServiceId,
  type CheckSample,
  type ManagedService,
  type ServiceInput,
  type WorkflowView,
} from "@hub/core";
import { captureResult } from "@/lib/capture";
import type { HubClient, SaveResult } from "./types";

const SAMPLE: ManagedService[] = [
  { id: "n8n", name: "n8n", url: "https://n8n.example.net", node: "core-01", slow_ms: 1500, origin: "yaml" },
  { id: "gitea", name: "Gitea", url: "https://git.example.net", node: "core-01", slow_ms: 1500, origin: "yaml" },
  { id: "vaultwarden", name: "Vaultwarden", url: "https://vault.example.net", node: "core-01", slow_ms: 1500, origin: "yaml" },
  { id: "pi-hole", name: "Pi-hole", url: "https://dns.example.net", node: "core-01", slow_ms: 1500, origin: "yaml" },
  { id: "jellyfin", name: "Jellyfin", url: "https://media.example.net", node: "niflheim", slow_ms: 1500, origin: "yaml" },
  { id: "sonarr", name: "Sonarr", url: "https://sonarr.example.net", node: "niflheim", slow_ms: 1500, origin: "yaml" },
];

/** Deterministic pretend results: mostly up, Jellyfin slow, Sonarr with a short outage this morning. */
function fakeStatus(id: string, at: number): Omit<CheckSample, "at"> {
  const hour = new Date(at).getHours();
  if (id === "sonarr" && hour >= 6 && hour < 8) return { status: "failed", ms: 5000 };
  if (id === "jellyfin") return { status: "slow", ms: 2400 };
  return { status: "up", ms: 40 + (id.length * 7) % 60 };
}

const fakeFetch = (services: () => ManagedService[]): typeof fetch => async (input) => {
  const svc = services().find((s) => (s.health ?? s.url) === String(input));
  const r = fakeStatus(svc?.id ?? "", Date.now());
  if (r.status === "failed") throw new TypeError("fetch failed");
  await new Promise((done) => setTimeout(done, Math.min(r.ms, 50)));
  return new Response(null, { status: 200 });
};

/** The public demo: the same core, adapters and monitor, running in the visitor's browser. */
export function createDemoClient(): HubClient {
  let services = [...SAMPLE];
  const removed = new Map<string, ManagedService>();
  const history = new Map<string, CheckSample[]>();
  // A day of pretend history, one check every 10 minutes.
  for (const s of services) {
    const now = Date.now();
    history.set(
      s.id,
      Array.from({ length: 144 }, (_, i) => {
        const at = now - (144 - i) * 600_000;
        return { at, ...fakeStatus(s.id, at) };
      }),
    );
  }
  const monitor = createMonitor({
    services: () => services,
    fetchFn: fakeFetch(() => services),
    store: {
      record: (samples) => samples.forEach(({ id, ...s }) => history.set(id, [...(history.get(id) ?? []), s])),
      history: (ids, since) => new Map(ids.map((id) => [id, (history.get(id) ?? []).filter((s) => s.at >= since)])),
    },
  });
  const mocks = createMockAdapters().filter((m) => m.id !== "checks");
  const snoozes = new Map<string, number>();
  const hub = createHub([...mocks, monitor.adapter], [], (items) => applySnoozes(items, snoozes, Date.now()));
  const nodes = ["core-01", "niflheim"];
  const run = (id: string, status: "success" | "error", minsAgo: number, ms: number) => ({
    id,
    status,
    startedAt: Date.now() - minsAgo * 60_000,
    durationMs: ms,
    href: "https://n8n.example.net",
  });
  const demoWorkflows: WorkflowView[] = [
    { id: "1", name: "Nightly backup → B2", active: true, runsToday: 1, failedToday: 1, href: "https://n8n.example.net", recent: [run("88", "error", 450, 300_000)] },
    { id: "2", name: "Hub notify", active: true, runsToday: 6, failedToday: 0, href: "https://n8n.example.net", recent: [run("87", "success", 20, 900), run("86", "success", 140, 850)] },
    { id: "3", name: "Pi-hole daily report", active: false, runsToday: 0, failedToday: 0, href: "https://n8n.example.net", recent: [] },
  ];

  function save(input: ServiceInput, id?: string): SaveResult {
    const p = serviceInputSchema.safeParse(input);
    if (!p.success) {
      const errors = Object.fromEntries(p.error.issues.map((i) => [String(i.path[0] ?? "form"), i.message]));
      return { ok: false, message: Object.values(errors)[0] ?? "Check the form", errors };
    }
    if (id) {
      services = services.map((s) => (s.id === id ? { ...s, ...p.data, id } : s));
      return { ok: true, message: `Saved ${p.data.name}` };
    }
    const newId = uniqueServiceId(p.data.name, [...services.map((s) => s.id), ...removed.keys()]);
    services = [...services, { ...p.data, id: newId, origin: "ui" }];
    return { ok: true, message: `Added ${p.data.name}` };
  }

  return {
    today: () => hub.today(),
    commands: () => hub.commands(),
    act: (itemId, actionId) => hub.act(itemId, actionId),
    capture: async (text) => captureResult(text),
    services: async () => ({
      services: await monitor.views(),
      nodes,
      removed: [...removed.values()].map(({ id, name, url, node }) => ({ id, name, url, node })),
      sample: false,
    }),
    inbox: async () => buildInbox(await hub.items(), []),
    async snooze(itemId, until) {
      snoozes.set(itemId, until);
      return { ok: true, message: "Snoozed" };
    },
    async unsnooze(itemId) {
      snoozes.delete(itemId);
      return { ok: true, message: "Back in the Inbox" };
    },
    async automations() {
      return { sample: false, workflows: demoWorkflows.map((w) => ({ ...w, recent: [...w.recent] })) };
    },
    async setWorkflowActive(id, active) {
      const w = demoWorkflows.find((x) => x.id === id);
      if (!w) return { ok: false, message: "No such workflow" };
      w.active = active;
      return { ok: true, message: active ? "Workflow switched on" : "Workflow switched off" };
    },
    async nodes() {
      const now = Date.now();
      const count = (id: string) => services.filter((s) => s.node === id).length;
      return {
        sample: false,
        sources: { tailscale: "ok", prometheus: "ok" },
        unmatchedExporters: [],
        nodes: [
          { id: "core-01", presence: { online: true, lastSeen: now, address: "100.64.0.1", os: "linux" }, metrics: { cpu: 34, memory: 71, memoryTotalBytes: 8.2e9, disk: 18, tempC: 52 }, services: count("core-01"), failing: 0 },
          { id: "niflheim", presence: { online: true, lastSeen: now, address: "100.64.0.2", os: "windows" }, metrics: { cpu: 12, memory: 44, memoryTotalBytes: 32e9, disk: 83, tempC: null }, services: count("niflheim"), failing: 1 },
          { id: "bifrost", presence: { online: false, lastSeen: now - 3 * 3_600_000, address: "100.64.0.3", os: "linux" }, metrics: null, services: 0, failing: 0 },
        ],
      };
    },
    detectService: (input) => detectService(input, services, nodes, null),
    async addService(input) {
      const r = save(input);
      if (r.ok) await monitor.runRound(services.slice(-1));
      return r;
    },
    async updateService(id, input) {
      const r = save(input, id);
      if (r.ok) await monitor.runRound(services.filter((s) => s.id === id));
      return r;
    },
    async removeService(id) {
      const s = services.find((x) => x.id === id);
      if (!s) return { ok: false, message: "That service no longer exists" };
      removed.set(id, s);
      services = services.filter((x) => x.id !== id);
      return { ok: true, message: `Removed ${s.name}` };
    },
    async restoreService(id) {
      const s = removed.get(id);
      if (!s) return { ok: false, message: "Nothing to restore" };
      removed.delete(id);
      services = [...services, s];
      return { ok: true, message: `Restored ${s.name}` };
    },
  };
}
