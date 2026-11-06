import "server-only";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { createChecksAdapter } from "@hub/adapter-checks";
import { createMockAdapters } from "@hub/adapter-mock";
import { createHub, parseHubConfig, type Hub, type HubConfig } from "@hub/core";

// One hub per server process; dev hot reloads keep it on globalThis so mock state survives.
const g = globalThis as unknown as { __hub?: Hub };

/** hub.yaml from HUB_CONFIG, else HUB_DATA_DIR/hub.yaml. No file means defaults; a bad file throws. */
export function loadConfig(): HubConfig {
  const file = process.env.HUB_CONFIG ?? path.join(process.env.HUB_DATA_DIR ?? "./data", "hub.yaml");
  return parseHubConfig(existsSync(file) ? readFileSync(file, "utf8") : "");
}

export function getHub(): Hub {
  if (!g.__hub) {
    const config = loadConfig();
    // Real adapters replace their mock as soon as hub.yaml configures them.
    const real = config.services.length ? [createChecksAdapter(config.services)] : [];
    const mocks = createMockAdapters().filter((m) => !real.some((r) => r.id === m.id));
    g.__hub = createHub([...mocks, ...real], config.inbox_rules);
  }
  return g.__hub;
}
