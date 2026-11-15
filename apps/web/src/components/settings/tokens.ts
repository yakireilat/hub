import type { AuditEntry, Item as ItemModel, TokenView } from "@hub/core";

const date = new Intl.DateTimeFormat(undefined, { day: "numeric", month: "short", year: "numeric" });
export const shortDate = (ms: number) => date.format(new Date(ms));

function ago(ms: number, now: number) {
  const m = Math.round((now - ms) / 60_000);
  if (m < 1) return "just now";
  if (m < 60) return `${m} min ago`;
  if (m < 48 * 60) return `${Math.round(m / 60)} h ago`;
  return `${Math.round(m / 1440)} d ago`;
}

export function tokenState(t: TokenView, now: number): "active" | "revoked" | "expired" {
  if (t.revokedAt !== null) return "revoked";
  if (t.expiresAt !== null && t.expiresAt <= now) return "expired";
  return "active";
}

/** A token as an Item: shape + word for its state, scopes and dates on the context line. */
export function tokenItem(t: TokenView, now: number): ItemModel {
  const state = tokenState(t, now);
  const expiry =
    state === "revoked"
      ? `revoked ${shortDate(t.revokedAt!)}`
      : t.expiresAt === null
        ? "never expires"
        : `${state === "expired" ? "expired" : "expires"} ${shortDate(t.expiresAt)}`;
  return {
    id: `token:${t.id}`,
    source: "hub",
    kind: "token",
    title: t.name,
    context: [t.scopes.join(", "), expiry, t.lastUsedAt ? `used ${ago(t.lastUsedAt, now)}` : "never used"].join(" · "),
    time: new Date(t.createdAt).toISOString(),
    status: state === "active" ? "up" : "idle",
    statusLabel: state === "active" ? "Active" : state === "revoked" ? "Revoked" : "Expired",
    route: "fyi",
    actions: [],
    href: "/settings",
  };
}

/** One logged call. Allowed = up with its HTTP status; refused = failed with the reason. */
export function auditItem(e: AuditEntry, i: number): ItemModel {
  const allowed = e.result === "allowed";
  return {
    id: `audit:${e.at}:${i}`,
    source: "hub",
    kind: "audit",
    title: `${e.method} ${e.path}`,
    context: [e.tokenName === "-" ? "unknown token" : e.tokenName, allowed ? e.access : e.result].join(" · "),
    time: new Date(e.at).toISOString(),
    status: allowed && e.status < 400 ? "up" : "failed",
    statusLabel: String(e.status),
    route: "fyi",
    actions: [],
    href: "/settings",
  };
}
