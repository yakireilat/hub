import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
const { openDb } = await import("./db");
const db = openDb(":memory:");
vi.mock("./hub", () => ({ hubDb: () => db, apiConfig: () => ({ public_url: "https://hub-api.mesh.net", audit_days: 90 }) }));
const { authorize, createToken, guarded, revokeToken, tokensPayload } = await import("./api");

const call = (path: string, init: RequestInit & { token?: string; viaApi?: boolean } = {}) => {
  const headers = new Headers(init.headers);
  if (init.token) headers.set("authorization", `Bearer ${init.token}`);
  if (init.viaApi) headers.set("x-hub-via", "api");
  return new Request(`http://hub-web:3000${path}`, { ...init, headers });
};
const ok = guarded(async () => Response.json({ ok: true }));

describe("API guard", () => {
  const made = createToken({ name: "Home Assistant", scopes: ["services:read"], expiresInDays: 30 });
  const token = made.token!;

  it("hands out a token once and stores only a hash", () => {
    expect(token).toMatch(/^hub_[a-f0-9]{12}_[A-Za-z0-9_-]{32}$/);
    const listed = tokensPayload().tokens;
    expect(listed).toHaveLength(1);
    expect(JSON.stringify(listed)).not.toContain(token.split("_")[2]);
  });

  it("lets a person through without a token, as today", async () => {
    expect((await ok(call("/api/v1/services/x", { method: "DELETE" }), {})).status).toBe(200);
  });

  it("refuses changes started by another site", async () => {
    const res = await ok(call("/api/v1/tokens", { method: "POST", headers: { "sec-fetch-site": "cross-site" } }), {});
    expect(res.status).toBe(403);
  });

  it("allows a scoped call and logs it with its status", async () => {
    expect((await ok(call("/api/v1/services", { token }), {})).status).toBe(200);
    expect(tokensPayload().audit[0]).toMatchObject({ tokenName: "Home Assistant", method: "GET", path: "/api/v1/services", result: "allowed", status: 200 });
    expect(tokensPayload().tokens[0]!.lastUsedAt).not.toBeNull();
  });

  it("refuses a missing scope, person-only routes, and bad tokens", async () => {
    expect((await ok(call("/api/v1/services", { token, method: "POST" }), {})).status).toBe(403);
    expect(tokensPayload().audit[0]).toMatchObject({ result: "missing scope", status: 403 });
    expect((await ok(call("/api/v1/tokens", { token }), {})).status).toBe(403);
    expect(tokensPayload().audit[0]).toMatchObject({ result: "person only" });
    const forged = token.replace(/.$/, (c) => (c === "a" ? "b" : "a"));
    expect((await ok(call("/api/v1/services", { token: forged }), {})).status).toBe(401);
    expect(tokensPayload().audit[0]).toMatchObject({ result: "unknown token" });
  });

  it("treats anything through hub-api as a machine, even without a token", () => {
    const v = authorize(call("/api/v1/today", { viaApi: true }));
    expect(v.kind).toBe("denied");
  });

  it("refuses expired and revoked tokens", async () => {
    const id = token.split("_")[1]!;
    expect(authorize(call("/api/v1/services", { token }), Date.now() + 31 * 86_400_000).kind).toBe("denied");
    expect(tokensPayload().audit[0]).toMatchObject({ result: "expired", status: 401 });
    expect(revokeToken(id).ok).toBe(true);
    expect(revokeToken(id).ok).toBe(false);
    expect((await ok(call("/api/v1/services", { token }), {})).status).toBe(401);
    expect(tokensPayload().audit.find((e) => e.at <= Date.now())).toMatchObject({ result: "revoked", status: 401 });
  });

  it("rejects bad new tokens", () => {
    expect(createToken({ name: "", scopes: ["services:read"] }).ok).toBe(false);
    expect(createToken({ name: "x", scopes: ["root" as never] }).ok).toBe(false);
  });
});
