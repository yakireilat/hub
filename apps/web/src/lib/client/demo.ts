import { createMonitor, detectService } from "@hub/adapter-checks";
import { createMockAdapters } from "@hub/adapter-mock";
import {
  createHub,
  serviceInputSchema,
  uniqueServiceId,
  type CheckSample,
  type ManagedService,
  type ServiceInput,
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
  const hub = createHub([...mocks, monitor.adapter]);
  const nodes = ["core-01", "niflheim"];

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
    services: async () => ({ services: await monitor.views(), nodes, sample: false }),
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
