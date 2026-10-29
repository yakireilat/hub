import { createMockAdapters } from "@hub/adapter-mock";
import { createHub } from "@hub/core";
import { captureResult } from "@/lib/capture";
import type { HubClient } from "./types";

/** The public demo: the same core and mock adapters, running in the visitor's browser. */
export function createDemoClient(): HubClient {
  const hub = createHub(createMockAdapters());
  return {
    today: () => hub.today(),
    commands: () => hub.commands(),
    act: (itemId, actionId) => hub.act(itemId, actionId),
    capture: async (text) => captureResult(text),
  };
}
