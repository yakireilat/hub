import { describe, expect, it } from "vitest";
import { createN8nAdapter, createN8nClient } from "./index";

const NOW = Date.UTC(2026, 10, 14, 12, 0);
const iso = (msAgo: number) => new Date(NOW - msAgo).toISOString();

function fakeN8n() {
  const calls: string[] = [];
  const executions = [
    { id: 105, workflowId: "w1", status: "error", startedAt: iso(10 * 60_000), stoppedAt: iso(9 * 60_000) },
    { id: 104, workflowId: "w1", status: "error", startedAt: iso(70 * 60_000), stoppedAt: iso(69 * 60_000) },
    { id: 103, workflowId: "w2", status: "error", startedAt: iso(2 * 3600_000), stoppedAt: iso(2 * 3600_000 - 3000) },
    { id: 102, workflowId: "w2", status: "success", startedAt: iso(3600_000), stoppedAt: iso(3600_000 - 2000), retryOf: "103" },
    { id: 101, workflowId: "w3", status: "success", startedAt: iso(5 * 3600_000), stoppedAt: iso(5 * 3600_000 - 1000) },
    { id: 90, workflowId: "w3", status: "success", startedAt: iso(30 * 3600_000), stoppedAt: iso(30 * 3600_000) },
  ];
  const fetchFn: typeof fetch = async (input, init) => {
    const url = String(input);
    calls.push(`${init?.method ?? "GET"} ${url.replace("http://n8n:5678/api/v1", "")}`);
    expect((init?.headers as Record<string, string>)["X-N8N-API-KEY"]).toBe("key");
    if (url.includes("/workflows?")) {
      return Response.json({
        data: [
          { id: "w1", name: "Nightly backup", active: true },
          { id: "w2", name: "Feed digest", active: true },
          { id: "w3", name: "Pi-hole report", active: false },
        ],
        nextCursor: null,
      });
    }
    if (url.includes("/executions?")) return Response.json({ data: executions, nextCursor: "more" });
    if (url.endsWith("/retry") || url.endsWith("/activate")) return Response.json({});
    return new Response(null, { status: 404 });
  };
  return { calls, fetchFn };
}

describe("n8n adapter", () => {
  it("needs you for the newest unretried failure per workflow and groups successes", async () => {
    const { fetchFn } = fakeN8n();
    const n8n = createN8nAdapter({ client: createN8nClient({ url: "http://n8n:5678", apiKey: "key", fetchFn }), publicUrl: "https://n8n.mesh.net", now: () => NOW });
    const items = await n8n.read();
    expect(items.map((i) => [i.id, i.title, i.route, i.status])).toEqual([
      ["n8n:exec:105", "Nightly backup", "needs_action", "failed"],
      ["n8n:ok", "Workflow runs", "fyi", "up"],
    ]);
    expect(items[0]).toMatchObject({ context: "Run 105 failed after 1 min", href: "https://n8n.mesh.net/workflow/w1/executions/105" });
    expect(items[1]).toMatchObject({ statusLabel: "2 succeeded", meta: { count: 2 } });
  });

  it("stops paging once runs are older than a day, and retries through the API", async () => {
    const { calls, fetchFn } = fakeN8n();
    const n8n = createN8nAdapter({ client: createN8nClient({ url: "http://n8n:5678", apiKey: "key", fetchFn }), publicUrl: "https://n8n.mesh.net", now: () => NOW });
    await n8n.read();
    expect(calls.filter((c) => c.includes("/executions?"))).toHaveLength(1);
    expect(await n8n.act("n8n:exec:105", "retry")).toEqual({ ok: true, message: "Retry started" });
    expect(calls).toContain("POST /executions/105/retry");
  });

  it("lists workflows with today's runs, problems first", async () => {
    const { calls, fetchFn } = fakeN8n();
    const n8n = createN8nAdapter({ client: createN8nClient({ url: "http://n8n:5678", apiKey: "key", fetchFn }), publicUrl: "https://n8n.mesh.net", now: () => NOW });
    const { workflows } = await n8n.automations();
    expect(workflows.map((w) => [w.name, w.active, w.runsToday, w.failedToday])).toEqual([
      ["Nightly backup", true, 2, 2],
      ["Feed digest", true, 2, 1],
      ["Pi-hole report", false, 1, 0],
    ]);
    expect(workflows[0]?.recent[0]).toMatchObject({ id: "105", status: "error", durationMs: 60_000 });
    expect(await n8n.setActive("w3", true)).toMatchObject({ ok: true });
    expect(calls).toContain("POST /workflows/w3/activate");
  });

  it("says when the key is wrong", async () => {
    const client = createN8nClient({ url: "http://n8n:5678", apiKey: "bad", fetchFn: async () => new Response(null, { status: 401 }) });
    await expect(client.workflows()).rejects.toThrow("n8n rejected the API key");
  });
});
