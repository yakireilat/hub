import type { ActResult, ServiceSuggestion } from "@hub/core";
import type { HubClient, SaveResult } from "./types";

const base = process.env.NEXT_PUBLIC_BASE_PATH ?? "";

async function json<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${base}/api/v1${path}`, { cache: "no-store", ...init });
  // Action endpoints answer 4xx with a JSON ActResult; anything else non-OK is a real failure.
  if (!res.ok && !res.headers.get("content-type")?.includes("json")) {
    throw new Error(`${path} answered ${res.status}`);
  }
  return res.json() as Promise<T>;
}

const send = (method: string, body?: unknown): RequestInit => ({
  method,
  headers: { "content-type": "application/json" },
  body: JSON.stringify(body ?? {}),
});
const post = (body: unknown) => send("POST", body);
const enc = encodeURIComponent;

export const httpClient: HubClient = {
  today: () => json("/today"),
  commands: () => json("/commands"),
  act: (itemId, actionId) => json<ActResult>(`/items/${enc(itemId)}/actions/${enc(actionId)}`, post({})),
  capture: (text) => json<ActResult>("/capture", post({ text })),
  services: () => json("/services"),
  nodes: () => json("/nodes"),
  async detectService(input) {
    const r = await json<ServiceSuggestion | ActResult>("/services/detect", post({ input }));
    if ("ok" in r && !r.ok) throw new Error(r.message);
    return r as ServiceSuggestion;
  },
  addService: (input) => json<SaveResult>("/services", post(input)),
  updateService: (id, input) => json<SaveResult>(`/services/${enc(id)}`, send("PATCH", input)),
  removeService: (id) => json<ActResult>(`/services/${enc(id)}`, send("DELETE")),
  restoreService: (id) => json<ActResult>(`/services/${enc(id)}/restore`, post({})),
};
