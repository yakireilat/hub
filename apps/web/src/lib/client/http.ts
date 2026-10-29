import type { ActResult } from "@hub/core";
import type { HubClient } from "./types";

const base = process.env.NEXT_PUBLIC_BASE_PATH ?? "";

async function json<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${base}/api/v1${path}`, { cache: "no-store", ...init });
  // Action endpoints answer 422 with a JSON ActResult; anything else non-OK is a real failure.
  if (!res.ok && !res.headers.get("content-type")?.includes("json")) {
    throw new Error(`${path} answered ${res.status}`);
  }
  return res.json() as Promise<T>;
}

const post = (body: unknown): RequestInit => ({
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify(body),
});

export const httpClient: HubClient = {
  today: () => json("/today"),
  commands: () => json("/commands"),
  act: (itemId, actionId) =>
    json<ActResult>(`/items/${encodeURIComponent(itemId)}/actions/${encodeURIComponent(actionId)}`, post({})),
  capture: (text) => json<ActResult>("/capture", post({ text })),
};
