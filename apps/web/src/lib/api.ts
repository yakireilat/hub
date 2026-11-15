import "server-only";
import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import {
  accessFor,
  parseToken,
  validateNewToken,
  type Access,
  type ActResult,
  type AuditEntry,
  type NewTokenInput,
  type TokensPayload,
} from "@hub/core";
import { apiConfig, hubDb } from "./hub";

const hash = (secret: string) => createHash("sha256").update(secret).digest("hex");

/** Requests through hub-api.mesh.net carry this header (nginx sets it), so they always need a token. */
const VIA_API = "x-hub-via";

type Verdict = { kind: "person" } | { kind: "token"; entry: Omit<AuditEntry, "status"> } | { kind: "denied"; response: Response };

function deny(status: 401 | 403, entry: Omit<AuditEntry, "status">, message: string): Verdict {
  hubDb().audit({ ...entry, status });
  return {
    kind: "denied",
    response: Response.json({ ok: false, message }, { status, headers: status === 401 ? { "www-authenticate": 'Bearer realm="hub"' } : {} }),
  };
}

/**
 * Who is calling and may they? No bearer token and not through hub-api: a person, who already got
 * past Authelia. Otherwise the token must exist, be live, and hold the route's scope.
 */
export function authorize(req: Request, now = Date.now()): Verdict {
  const header = req.headers.get("authorization");
  const viaApi = req.headers.get(VIA_API) === "api";
  if (!viaApi && !header?.startsWith("Bearer ")) {
    // A person's browser: refuse changes started by another site (the Authelia cookie would ride along).
    if (!["GET", "HEAD"].includes(req.method) && req.headers.get("sec-fetch-site") === "cross-site") {
      return { kind: "denied", response: Response.json({ ok: false, message: "Cross-site requests can't change the hub" }, { status: 403 }) };
    }
    return { kind: "person" };
  }

  const url = new URL(req.url);
  const path = url.pathname.slice(Math.max(0, url.pathname.indexOf("/api/v1/")));
  const access: Access = accessFor(req.method, path);
  const base = { at: now, method: req.method, path, access };
  const t = parseToken(header);
  const row = t ? hubDb().token(t.id) : null;
  if (!t || !row || !timingSafeEqual(Buffer.from(hash(t.secret)), Buffer.from(row.secretHash))) {
    return deny(401, { ...base, tokenId: t?.id ?? "-", tokenName: row?.name ?? "-", result: "unknown token" }, "Send a valid hub token: Authorization: Bearer hub_…");
  }
  const entry = { ...base, tokenId: row.id, tokenName: row.name };
  if (row.revokedAt !== null) return deny(401, { ...entry, result: "revoked" }, "This token was revoked");
  if (row.expiresAt !== null && row.expiresAt <= now) return deny(401, { ...entry, result: "expired" }, "This token has expired");
  hubDb().touchToken(row.id, now);
  if (access === "person") return deny(403, { ...entry, result: "person only" }, "Only a signed-in person can do this, not a token");
  if (access !== "open" && !row.scopes.includes(access)) {
    return deny(403, { ...entry, result: "missing scope" }, `This token needs the ${access} scope`);
  }
  return { kind: "token", entry: { ...entry, result: "allowed" } };
}

/**
 * Wraps a route handler: checks the caller first, and logs every token call with the status it got.
 * Every /api/v1 handler goes through this.
 */
export function guarded<C>(handler: (req: Request, ctx: C) => Response | Promise<Response>) {
  return async (req: Request, ctx: C): Promise<Response> => {
    const v = authorize(req);
    if (v.kind === "denied") return v.response;
    let res: Response;
    try {
      res = await handler(req, ctx);
    } catch (e) {
      if (v.kind === "token") hubDb().audit({ ...v.entry, status: 500 });
      throw e;
    }
    if (v.kind === "token") hubDb().audit({ ...v.entry, status: res.status });
    return res;
  };
}

export function tokensPayload(): TokensPayload {
  return { tokens: hubDb().tokens(), audit: hubDb().auditLog(200), apiUrl: apiConfig().public_url };
}

export function createToken(input: Partial<NewTokenInput>, now = Date.now()): ActResult & { token?: string } {
  const v = validateNewToken(input);
  if (!v.ok) return v;
  const id = randomBytes(6).toString("hex");
  const secret = randomBytes(24).toString("base64url");
  const { name, scopes, expiresInDays } = v.value;
  hubDb().saveToken({
    id,
    name,
    scopes,
    secretHash: hash(secret),
    createdAt: now,
    expiresAt: expiresInDays === null ? null : now + expiresInDays * 86_400_000,
    lastUsedAt: null,
    revokedAt: null,
  });
  return { ok: true, message: `Created “${name}”. Copy the token now: it isn't shown again.`, token: `hub_${id}_${secret}` };
}

export function revokeToken(id: string): ActResult {
  const t = hubDb().token(id);
  if (!t) return { ok: false, message: "No such token" };
  if (!hubDb().revokeToken(id, Date.now())) return { ok: false, message: `“${t.name}” was already revoked` };
  return { ok: true, message: `Revoked “${t.name}”. Calls with it now get 401.` };
}
