import "server-only";
import { mkdirSync } from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import type { CheckStore } from "@hub/adapter-checks";
import type { AuditEntry, CheckSample, ApiScope, StoredService, TokenView } from "@hub/core";

export type TokenRow = TokenView & { secretHash: string };

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
  `CREATE TABLE snoozes (item_id TEXT PRIMARY KEY, until INTEGER NOT NULL)`,
  `CREATE TABLE settings (key TEXT PRIMARY KEY, value TEXT NOT NULL)`,
  `CREATE TABLE api_tokens (
     id TEXT PRIMARY KEY, name TEXT NOT NULL, scopes TEXT NOT NULL, secret_hash TEXT NOT NULL,
     created_at INTEGER NOT NULL, expires_at INTEGER, last_used_at INTEGER, revoked_at INTEGER);
   CREATE TABLE api_audit (
     at INTEGER NOT NULL, token_id TEXT NOT NULL, token_name TEXT NOT NULL, method TEXT NOT NULL,
     path TEXT NOT NULL, access TEXT NOT NULL, result TEXT NOT NULL, status INTEGER NOT NULL);
   CREATE INDEX api_audit_by_time ON api_audit (at)`,
];

export interface HubDb extends CheckStore {
  services(): StoredService[];
  saveService(s: StoredService): void;
  setDeleted(id: string, deleted: boolean): void;
  /** Drops check results older than `before` (epoch ms). */
  prune(before: number): void;
  /** Inbox item id → snoozed until (epoch ms), for snoozes that haven't run out. */
  snoozes(now: number): Map<string, number>;
  snooze(itemId: string, until: number): void;
  unsnooze(itemId: string): void;
  /** Small key/value settings, e.g. the Google refresh token. */
  getSetting(key: string): string | null;
  setSetting(key: string, value: string | null): void;
  tokens(): TokenView[];
  token(id: string): TokenRow | null;
  saveToken(t: TokenRow): void;
  revokeToken(id: string, at: number): boolean;
  touchToken(id: string, at: number): void;
  audit(entry: AuditEntry): void;
  /** Newest first. */
  auditLog(limit: number): (AuditEntry)[];
  pruneAudit(before: number): void;
}

const tokenOf = (r: Record<string, unknown>): TokenRow => ({
  id: String(r.id),
  name: String(r.name),
  scopes: JSON.parse(String(r.scopes)) as ApiScope[],
  secretHash: String(r.secret_hash),
  createdAt: Number(r.created_at),
  expiresAt: r.expires_at == null ? null : Number(r.expires_at),
  lastUsedAt: r.last_used_at == null ? null : Number(r.last_used_at),
  revokedAt: r.revoked_at == null ? null : Number(r.revoked_at),
});

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
      db.prepare("DELETE FROM snoozes WHERE until < ?").run(Date.now());
    },
    snoozes(now) {
      const rows = db.prepare("SELECT item_id, until FROM snoozes WHERE until > ?").all(now) as { item_id: string; until: number }[];
      return new Map(rows.map((r) => [r.item_id, r.until]));
    },
    snooze(itemId, until) {
      db.prepare("INSERT INTO snoozes (item_id, until) VALUES (?, ?) ON CONFLICT (item_id) DO UPDATE SET until = excluded.until").run(itemId, until);
    },
    unsnooze(itemId) {
      db.prepare("DELETE FROM snoozes WHERE item_id = ?").run(itemId);
    },
    getSetting(key) {
      const row = db.prepare("SELECT value FROM settings WHERE key = ?").get(key) as { value: string } | undefined;
      return row?.value ?? null;
    },
    setSetting(key, value) {
      if (value === null) db.prepare("DELETE FROM settings WHERE key = ?").run(key);
      else db.prepare("INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT (key) DO UPDATE SET value = excluded.value").run(key, value);
    },
    tokens() {
      // Never the hash: only what Settings → API shows.
      return (db.prepare("SELECT * FROM api_tokens ORDER BY created_at DESC").all() as Record<string, unknown>[]).map((r) => {
        const { id, name, scopes, createdAt, expiresAt, lastUsedAt, revokedAt } = tokenOf(r);
        return { id, name, scopes, createdAt, expiresAt, lastUsedAt, revokedAt };
      });
    },
    token(id) {
      const r = db.prepare("SELECT * FROM api_tokens WHERE id = ?").get(id) as Record<string, unknown> | undefined;
      return r ? tokenOf(r) : null;
    },
    saveToken(t) {
      db.prepare(
        `INSERT INTO api_tokens (id, name, scopes, secret_hash, created_at, expires_at, last_used_at, revoked_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      ).run(t.id, t.name, JSON.stringify(t.scopes), t.secretHash, t.createdAt, t.expiresAt, t.lastUsedAt, t.revokedAt);
    },
    revokeToken(id, at) {
      return Number(db.prepare("UPDATE api_tokens SET revoked_at = ? WHERE id = ? AND revoked_at IS NULL").run(at, id).changes) > 0;
    },
    touchToken(id, at) {
      db.prepare("UPDATE api_tokens SET last_used_at = ? WHERE id = ?").run(at, id);
    },
    audit(e) {
      db.prepare("INSERT INTO api_audit (at, token_id, token_name, method, path, access, result, status) VALUES (?, ?, ?, ?, ?, ?, ?, ?)").run(
        e.at, e.tokenId, e.tokenName, e.method, e.path, e.access, e.result, e.status,
      );
    },
    auditLog(limit) {
      return (db.prepare("SELECT * FROM api_audit ORDER BY at DESC, rowid DESC LIMIT ?").all(limit) as Record<string, unknown>[]).map((r) => ({
        at: Number(r.at),
        tokenId: String(r.token_id),
        tokenName: String(r.token_name),
        method: String(r.method),
        path: String(r.path),
        access: String(r.access) as AuditEntry["access"],
        result: String(r.result) as AuditEntry["result"],
        status: Number(r.status),
      }));
    },
    pruneAudit(before) {
      db.prepare("DELETE FROM api_audit WHERE at < ?").run(before);
    },
  };
}
