import "server-only";
import { mkdirSync } from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import type { CheckStore } from "@hub/adapter-checks";
import type { CheckSample, StoredService } from "@hub/core";

/**
 * The hub's SQLite file, $HUB_DATA_DIR/hub.db. Migrations only ever add (CLAUDE.md), so an older
 * image still runs against a newer file when a deploy rolls back.
 */
const MIGRATIONS = [
  `CREATE TABLE services (
     id TEXT PRIMARY KEY, origin TEXT NOT NULL, deleted INTEGER NOT NULL DEFAULT 0,
     name TEXT NOT NULL, url TEXT NOT NULL, health TEXT, node TEXT NOT NULL, slow_ms INTEGER NOT NULL,
     updated_at INTEGER NOT NULL)`,
  `CREATE TABLE checks (service_id TEXT NOT NULL, at INTEGER NOT NULL, status TEXT NOT NULL, ms INTEGER NOT NULL);
   CREATE INDEX checks_by_service ON checks (service_id, at)`,
];

export interface HubDb extends CheckStore {
  services(): StoredService[];
  saveService(s: StoredService): void;
  setDeleted(id: string, deleted: boolean): void;
  /** Drops check results older than `before` (epoch ms). */
  prune(before: number): void;
}

export function openDb(file = path.join(process.env.HUB_DATA_DIR ?? "./data", "hub.db")): HubDb {
  if (file !== ":memory:") mkdirSync(path.dirname(file), { recursive: true });
  const db = new DatabaseSync(file);
  db.exec("PRAGMA journal_mode = WAL; PRAGMA busy_timeout = 5000");
  const version = Number((db.prepare("PRAGMA user_version").get() as { user_version: number }).user_version);
  MIGRATIONS.slice(version).forEach((sql, i) => {
    db.exec(sql);
    db.exec(`PRAGMA user_version = ${version + i + 1}`);
  });

  const insertCheck = db.prepare("INSERT INTO checks (service_id, at, status, ms) VALUES (?, ?, ?, ?)");

  return {
    services() {
      return (db.prepare("SELECT * FROM services ORDER BY updated_at").all() as Record<string, unknown>[]).map((r) => ({
        id: String(r.id),
        origin: r.origin === "yaml" ? "yaml" : "ui",
        deleted: r.deleted === 1,
        name: String(r.name),
        url: String(r.url),
        ...(r.health ? { health: String(r.health) } : {}),
        node: String(r.node),
        slow_ms: Number(r.slow_ms),
      }));
    },
    saveService(s) {
      db.prepare(
        `INSERT INTO services (id, origin, deleted, name, url, health, node, slow_ms, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT (id) DO UPDATE SET origin = excluded.origin, deleted = excluded.deleted, name = excluded.name,
           url = excluded.url, health = excluded.health, node = excluded.node, slow_ms = excluded.slow_ms,
           updated_at = excluded.updated_at`,
      ).run(s.id, s.origin, s.deleted ? 1 : 0, s.name, s.url, s.health ?? null, s.node, s.slow_ms, Date.now());
    },
    setDeleted(id, deleted) {
      db.prepare("UPDATE services SET deleted = ?, updated_at = ? WHERE id = ?").run(deleted ? 1 : 0, Date.now(), id);
    },
    record(samples) {
      db.exec("BEGIN");
      try {
        for (const s of samples) insertCheck.run(s.id, s.at, s.status, s.ms);
        db.exec("COMMIT");
      } catch (e) {
        db.exec("ROLLBACK");
        throw e;
      }
    },
    history(ids, since) {
      const out = new Map<string, CheckSample[]>(ids.map((id) => [id, []]));
      if (!ids.length) return out;
      const rows = db
        .prepare(
          `SELECT service_id, at, status, ms FROM checks WHERE at >= ? AND service_id IN (${ids.map(() => "?").join(",")}) ORDER BY at`,
        )
        .all(since, ...ids) as { service_id: string; at: number; status: CheckSample["status"]; ms: number }[];
      for (const r of rows) out.get(r.service_id)?.push({ at: r.at, status: r.status, ms: r.ms });
      return out;
    },
    prune(before) {
      db.prepare("DELETE FROM checks WHERE at < ?").run(before);
    },
  };
}
