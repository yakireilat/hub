import { createDemoClient } from "./demo";
import { httpClient } from "./http";
import type { HubClient } from "./types";

export type { HubClient } from "./types";

export const isDemo = process.env.NEXT_PUBLIC_HUB_MODE === "demo";

export function createHubClient(): HubClient {
  return isDemo ? createDemoClient() : httpClient;
}
