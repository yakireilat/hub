/** What a system user's token may do. Each API route needs exactly one of these. */
export const API_SCOPES = {
  "today:read": "Read Today and the palette's commands",
  "inbox:read": "Read the Inbox",
  "inbox:write": "Snooze and unsnooze Inbox items",
  "items:act": "Run item actions such as Retry, Accept, Decline",
  "capture:write": "Capture notes",
  "services:read": "Read services, uptime and nodes",
  "services:write": "Add, edit, remove and restore services",
  "calendar:read": "Read the calendar",
  "calendar:write": "Create, change and delete events",
  "automations:read": "Read n8n workflows and runs",
  "automations:write": "Switch n8n workflows on and off",
} as const;

export type ApiScope = keyof typeof API_SCOPES;
export const ALL_API_SCOPES = Object.keys(API_SCOPES) as ApiScope[];

/**
 * person = only a signed-in person (through Authelia) may call it, never a token: token management,
 * the audit log, connecting Google. open = any valid token (the API description).
 */
export type Access = ApiScope | "person" | "open";

const RULES: [method: string, path: RegExp, access: Access][] = [
  ["GET", /^\/api\/v1\/openapi\.json$/, "open"],
  ["*", /^\/api\/v1\/(tokens|audit)(\/|$)/, "person"],
  ["*", /^\/api\/v1\/calendar\/(connect|callback|disconnect)$/, "person"],
  ["GET", /^\/api\/v1\/(today|commands)$/, "today:read"],
  ["GET", /^\/api\/v1\/inbox$/, "inbox:read"],
  ["*", /^\/api\/v1\/inbox\/[^/]+\/snooze$/, "inbox:write"],
  ["POST", /^\/api\/v1\/items\/[^/]+\/actions\/[^/]+$/, "items:act"],
  ["POST", /^\/api\/v1\/capture$/, "capture:write"],
  ["GET", /^\/api\/v1\/(services|nodes)$/, "services:read"],
  ["POST", /^\/api\/v1\/services\/detect$/, "services:read"],
  ["*", /^\/api\/v1\/services(\/|$)/, "services:write"],
  ["GET", /^\/api\/v1\/calendar$/, "calendar:read"],
  ["*", /^\/api\/v1\/calendar\/events(\/|$)/, "calendar:write"],
  ["GET", /^\/api\/v1\/automations$/, "automations:read"],
  ["POST", /^\/api\/v1\/automations\/[^/]+\/active$/, "automations:write"],
];

/** What a request needs. Anything not listed is person-only: a new route stays closed to tokens until it's given a scope. */
export function accessFor(method: string, path: string): Access {
  const m = method.toUpperCase();
  for (const [rm, re, access] of RULES) if ((rm === "*" || rm === m) && re.test(path)) return access;
  return "person";
}

/** Tokens look like hub_<id>_<secret>; only a hash of the secret is stored. */
export function parseToken(header: string | null): { id: string; secret: string } | null {
  const m = /^Bearer hub_([a-f0-9]{12})_([A-Za-z0-9_-]{20,})$/.exec(header ?? "");
  return m ? { id: m[1]!, secret: m[2]! } : null;
}

export interface TokenView {
  id: string;
  name: string;
  scopes: ApiScope[];
  createdAt: number;
  /** null = never expires. */
  expiresAt: number | null;
  lastUsedAt: number | null;
  revokedAt: number | null;
}

export interface AuditEntry {
  at: number;
  tokenId: string;
  tokenName: string;
  method: string;
  path: string;
  access: Access;
  /** allowed, or why it wasn't. */
  result: "allowed" | "unknown token" | "revoked" | "expired" | "missing scope" | "person only";
  /** The HTTP status the caller got. */
  status: number;
}

export interface Endpoint {
  method: "GET" | "POST" | "PATCH" | "DELETE";
  /** OpenAPI-style path, e.g. /api/v1/services/{id}. */
  path: string;
  summary: string;
  access: Access;
  /** A JSON body example, for the docs. */
  body?: Record<string, unknown>;
}

/** Every /api/v1 endpoint. The OpenAPI description and Settings → API are built from this list. */
export const ENDPOINTS: Endpoint[] = [
  { method: "GET", path: "/api/v1/openapi.json", summary: "This API, as OpenAPI 3.1", access: "open" },
  { method: "GET", path: "/api/v1/today", summary: "Today: what needs you, what's next, the services", access: "today:read" },
  { method: "GET", path: "/api/v1/commands", summary: "Every palette command", access: "today:read" },
  { method: "POST", path: "/api/v1/items/{id}/actions/{action}", summary: "Run an item's action (retry, accept, decline…)", access: "items:act" },
  { method: "POST", path: "/api/v1/capture", summary: "Capture a note", access: "capture:write", body: { text: "Buy fuses" } },
  { method: "GET", path: "/api/v1/inbox", summary: "The Inbox", access: "inbox:read" },
  { method: "POST", path: "/api/v1/inbox/{id}/snooze", summary: "Snooze an item until a time (epoch ms)", access: "inbox:write", body: { until: 1767250800000 } },
  { method: "DELETE", path: "/api/v1/inbox/{id}/snooze", summary: "Unsnooze an item", access: "inbox:write" },
  { method: "GET", path: "/api/v1/services", summary: "Services with uptime", access: "services:read" },
  { method: "GET", path: "/api/v1/nodes", summary: "Node tiles: presence and metrics", access: "services:read" },
  { method: "POST", path: "/api/v1/services/detect", summary: "Suggest a service for a name or address", access: "services:read", body: { input: "git.mesh.net" } },
  { method: "POST", path: "/api/v1/services", summary: "Add a service", access: "services:write", body: { name: "Gitea", url: "https://git.mesh.net", node: "core-01" } },
  { method: "PATCH", path: "/api/v1/services/{id}", summary: "Change a service", access: "services:write", body: { slow_ms: 2000 } },
  { method: "DELETE", path: "/api/v1/services/{id}", summary: "Remove a service (it can be restored)", access: "services:write" },
  { method: "POST", path: "/api/v1/services/{id}/restore", summary: "Restore a removed service", access: "services:write" },
  { method: "GET", path: "/api/v1/calendar", summary: "A week of events (?start=YYYY-MM-DD)", access: "calendar:read" },
  { method: "POST", path: "/api/v1/calendar/events", summary: "Add an event; no time = all day", access: "calendar:write", body: { title: "Dentist", date: "2026-11-20", time: "09:30", durationMin: 60 } },
  { method: "PATCH", path: "/api/v1/calendar/events/{id}", summary: "Change an event (guests are told)", access: "calendar:write", body: { title: "Dentist", date: "2026-11-21", time: "10:00", durationMin: 30 } },
  { method: "DELETE", path: "/api/v1/calendar/events/{id}", summary: "Delete an event (guests are told)", access: "calendar:write" },
  { method: "GET", path: "/api/v1/automations", summary: "n8n workflows with today's runs", access: "automations:read" },
  { method: "POST", path: "/api/v1/automations/{id}/active", summary: "Switch a workflow on or off", access: "automations:write", body: { active: true } },
  { method: "GET", path: "/api/v1/tokens", summary: "API tokens (people only)", access: "person" },
  { method: "POST", path: "/api/v1/tokens", summary: "Create a token; the secret is shown once (people only)", access: "person", body: { name: "Home Assistant", scopes: ["services:read"], expiresInDays: 90 } },
  { method: "DELETE", path: "/api/v1/tokens/{id}", summary: "Revoke a token (people only)", access: "person" },
  { method: "GET", path: "/api/v1/audit", summary: "Every call made with a token (people only)", access: "person" },
];

/** OpenAPI 3.1 for ENDPOINTS. Each operation names its scope in x-hub-scope and in its security requirement. */
export function openApi(serverUrl: string) {
  const paths: Record<string, Record<string, unknown>> = {};
  for (const e of ENDPOINTS) {
    const params = [...e.path.matchAll(/\{(\w+)\}/g)].map((m) => ({ name: m[1], in: "path", required: true, schema: { type: "string" } }));
    (paths[e.path] ??= {})[e.method.toLowerCase()] = {
      summary: e.summary,
      "x-hub-scope": e.access,
      ...(params.length ? { parameters: params } : {}),
      ...(e.body ? { requestBody: { required: true, content: { "application/json": { schema: { type: "object" }, example: e.body } } } } : {}),
      security: e.access === "person" ? [] : [{ hubToken: e.access === "open" ? [] : [e.access] }],
      responses: {
        "200": { description: "OK", content: { "application/json": { schema: { type: "object" } } } },
        "401": { description: "No token, or an unknown, revoked or expired one" },
        "403": { description: "The token lacks this scope, or the endpoint is for people only" },
      },
    };
  }
  return {
    openapi: "3.1.0",
    info: {
      title: "Hub API",
      version: "1",
      description: "The Mesh hub for system users. Send `Authorization: Bearer hub_…`; create tokens in Settings → API. Every call is logged.",
    },
    servers: [{ url: serverUrl }],
    components: { securitySchemes: { hubToken: { type: "http", scheme: "bearer", bearerFormat: "hub_<id>_<secret>" } } },
    paths,
  };
}

/** What a person types when creating a token. */
export interface NewTokenInput {
  name: string;
  scopes: ApiScope[];
  /** null = never expires. */
  expiresInDays: number | null;
}

export function validateNewToken(input: Partial<NewTokenInput>): { ok: true; value: NewTokenInput } | { ok: false; message: string } {
  const name = typeof input.name === "string" ? input.name.trim() : "";
  if (!name || name.length > 60) return { ok: false, message: "Give the token a name (up to 60 characters)" };
  const scopes = Array.isArray(input.scopes) ? [...new Set(input.scopes)] : [];
  if (!scopes.length) return { ok: false, message: "Pick at least one scope" };
  const bad = scopes.find((s) => !(s in API_SCOPES));
  if (bad) return { ok: false, message: `Unknown scope “${String(bad)}”` };
  const days = input.expiresInDays;
  if (days !== null && days !== undefined && (!Number.isInteger(days) || days < 1 || days > 3650)) {
    return { ok: false, message: "Expiry is 1 to 3650 days, or never" };
  }
  return { ok: true, value: { name, scopes: scopes as ApiScope[], expiresInDays: days === undefined ? 90 : days } };
}

export interface TokensPayload {
  tokens: TokenView[];
  audit: AuditEntry[];
  /** Where machines call the API, e.g. https://hub-api.mesh.net. */
  apiUrl: string;
}
