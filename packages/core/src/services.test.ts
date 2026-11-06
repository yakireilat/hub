import { describe, expect, it } from "vitest";
import { mergeServices, serviceInputSchema, summarizeUptime, uniqueServiceId, type StoredService } from "./services";

const yaml = [
  { name: "n8n", url: "https://n8n.mesh.net", node: "core-01", slow_ms: 1500 },
  { name: "Gitea", url: "https://git.mesh.net", node: "core-01", slow_ms: 1500 },
];
const row = (over: Partial<StoredService>): StoredService => ({
  id: "x",
  name: "X",
  url: "https://x.mesh.net",
  node: "core-01",
  slow_ms: 1500,
  origin: "ui",
  deleted: false,
  ...over,
});

describe("mergeServices", () => {
  it("keeps yaml order, applies edits, hides removals, appends UI services", () => {
    const out = mergeServices(yaml, [
      row({ id: "n8n", name: "n8n (flows)", url: "https://flow.mesh.net", origin: "yaml" }),
      row({ id: "gitea", name: "Gitea", origin: "yaml", deleted: true }),
      row({ id: "jellyfin", name: "Jellyfin" }),
      row({ id: "gone", name: "Gone", deleted: true }),
    ]);
    expect(out.map((s) => [s.id, s.name, s.origin])).toEqual([
      ["n8n", "n8n (flows)", "yaml"],
      ["jellyfin", "Jellyfin", "ui"],
    ]);
    expect(out[0]?.url).toBe("https://flow.mesh.net");
  });
});

describe("uniqueServiceId", () => {
  it("adds a number when the slug is taken", () => {
    expect(uniqueServiceId("Home Assistant", [])).toBe("home-assistant");
    expect(uniqueServiceId("Gitea", ["gitea", "gitea-2"])).toBe("gitea-3");
  });
});

describe("serviceInputSchema", () => {
  it("fills defaults and treats an empty health check as none", () => {
    expect(serviceInputSchema.parse({ name: " Jellyfin ", url: "https://media.mesh.net", health: "" })).toEqual({
      name: "Jellyfin",
      url: "https://media.mesh.net",
      node: "core-01",
      slow_ms: 1500,
    });
    expect(serviceInputSchema.safeParse({ name: "x", url: "media" }).success).toBe(false);
  });
});

describe("summarizeUptime", () => {
  const HOUR = 3_600_000;
  const now = Date.UTC(2026, 10, 6, 12, 30);
  it("buckets by hour with the worst status and counts uptime", () => {
    const s = summarizeUptime(
      [
        { at: now - 10 * 60_000, status: "up", ms: 20 },
        { at: now - 5 * 60_000, status: "failed", ms: 5000 },
        { at: now - 2 * HOUR, status: "slow", ms: 2000 },
        { at: now - 3 * 24 * HOUR, status: "up", ms: 20 },
      ],
      now,
    );
    expect(s.buckets).toHaveLength(24);
    expect(s.buckets.at(-1)).toMatchObject({ status: "failed", checks: 2, failed: 1 });
    expect(s.buckets.at(-3)).toMatchObject({ status: "slow", checks: 1 });
    expect(s.buckets.at(-2)?.status).toBeNull();
    expect(s.uptime24h).toBeCloseTo(2 / 3);
    expect(s.uptime7d).toBeCloseTo(3 / 4);
    expect(s.failures24h).toBe(1);
  });
  it("reports no data as null", () => {
    expect(summarizeUptime([], now)).toMatchObject({ uptime24h: null, uptime7d: null, failures24h: 0 });
  });
});
