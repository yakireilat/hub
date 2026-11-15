import { describe, expect, it } from "vitest";
import { accessFor, ENDPOINTS, openApi, parseToken, validateNewToken } from "./api";

describe("API scopes", () => {
  it("maps each route to the scope it needs", () => {
    expect(accessFor("GET", "/api/v1/today")).toBe("today:read");
    expect(accessFor("GET", "/api/v1/services")).toBe("services:read");
    expect(accessFor("POST", "/api/v1/services/detect")).toBe("services:read");
    expect(accessFor("PATCH", "/api/v1/services/gitea")).toBe("services:write");
    expect(accessFor("POST", "/api/v1/items/n8n%3Aexec%3A105/actions/retry")).toBe("items:act");
    expect(accessFor("DELETE", "/api/v1/inbox/x/snooze")).toBe("inbox:write");
    expect(accessFor("PATCH", "/api/v1/calendar/events/abc")).toBe("calendar:write");
    expect(accessFor("POST", "/api/v1/automations/7/active")).toBe("automations:write");
    expect(accessFor("GET", "/api/v1/openapi.json")).toBe("open");
  });
  it("keeps token management, Google sign-in and unknown routes away from tokens", () => {
    expect(accessFor("POST", "/api/v1/tokens")).toBe("person");
    expect(accessFor("GET", "/api/v1/audit")).toBe("person");
    expect(accessFor("GET", "/api/v1/calendar/connect")).toBe("person");
    expect(accessFor("GET", "/api/v1/something-new")).toBe("person");
    expect(accessFor("DELETE", "/api/v1/today")).toBe("person");
  });
  it("reads only well-formed tokens", () => {
    expect(parseToken("Bearer hub_0123456789ab_abcdefghijklmnopqrstuvwxyz012345")).toEqual({ id: "0123456789ab", secret: "abcdefghijklmnopqrstuvwxyz012345" });
    expect(parseToken("Bearer hub_xyz_secret")).toBeNull();
    expect(parseToken("Basic dXNlcjpwYXNz")).toBeNull();
    expect(parseToken(null)).toBeNull();
  });
});

describe("API description", () => {
  it("names, for every endpoint, the scope the guard actually checks", () => {
    for (const e of ENDPOINTS) expect(accessFor(e.method, e.path.replace(/\{\w+\}/g, "x1")), `${e.method} ${e.path}`).toBe(e.access);
  });
  it("is valid-looking OpenAPI with path parameters", () => {
    const doc = openApi("https://hub-api.mesh.net");
    const op = (doc.paths["/api/v1/services/{id}"] as Record<string, { parameters: unknown[] }>).patch;
    expect(op?.parameters).toEqual([{ name: "id", in: "path", required: true, schema: { type: "string" } }]);
  });
  it("checks new tokens", () => {
    expect(validateNewToken({ name: " HA ", scopes: ["services:read"] })).toEqual({ ok: true, value: { name: "HA", scopes: ["services:read"], expiresInDays: 90 } });
    expect(validateNewToken({ name: "x", scopes: ["root" as never] }).ok).toBe(false);
    expect(validateNewToken({ name: "x", scopes: [] }).ok).toBe(false);
    expect(validateNewToken({ name: "x", scopes: ["inbox:read"], expiresInDays: null })).toMatchObject({ ok: true, value: { expiresInDays: null } });
  });
});
