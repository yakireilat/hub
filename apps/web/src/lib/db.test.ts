import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterAll, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
const { openDb } = await import("./db");

const dir = mkdtempSync(path.join(tmpdir(), "hub-db-"));
afterAll(() => rmSync(dir, { recursive: true, force: true }));

describe("hub.db", () => {
  it("saves, hides and restores services, and survives reopening", () => {
    const file = path.join(dir, "hub.db");
    const db = openDb(file);
    db.saveService({ id: "jellyfin", name: "Jellyfin", url: "https://media.mesh.net", health: "https://media.mesh.net/health", node: "niflheim", slow_ms: 2000, origin: "ui", deleted: false });
    db.saveService({ id: "gitea", name: "Gitea", url: "https://git.mesh.net", node: "core-01", slow_ms: 1500, origin: "yaml", deleted: true });
    db.setDeleted("gitea", false);
    const again = openDb(file);
    expect(again.services()).toEqual([
      { id: "jellyfin", name: "Jellyfin", url: "https://media.mesh.net", health: "https://media.mesh.net/health", node: "niflheim", slow_ms: 2000, origin: "ui", deleted: false },
      { id: "gitea", name: "Gitea", url: "https://git.mesh.net", node: "core-01", slow_ms: 1500, origin: "yaml", deleted: false },
    ]);
  });

  it("keeps check history per service and prunes old results", () => {
    const db = openDb(":memory:");
    db.record([
      { id: "a", at: 1_000, status: "up", ms: 10 },
      { id: "a", at: 2_000, status: "failed", ms: 5000 },
      { id: "b", at: 2_000, status: "slow", ms: 1800 },
    ]);
    expect(db.history(["a", "b", "c"], 1_500)).toEqual(
      new Map([
        ["a", [{ at: 2_000, status: "failed", ms: 5000 }]],
        ["b", [{ at: 2_000, status: "slow", ms: 1800 }]],
        ["c", []],
      ]),
    );
    db.prune(1_500);
    expect(db.history(["a"], 0).get("a")).toHaveLength(1);
  });
});
