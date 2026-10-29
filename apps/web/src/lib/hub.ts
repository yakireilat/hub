import "server-only";
import { createMockAdapters } from "@hub/adapter-mock";
import { createHub, type Hub } from "@hub/core";

// One hub per server process; dev hot reloads keep it on globalThis so mock state survives.
const g = globalThis as unknown as { __hub?: Hub };

export function getHub(): Hub {
  g.__hub ??= createHub(createMockAdapters());
  return g.__hub;
}
