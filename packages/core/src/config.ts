import { parse } from "yaml";
import { z } from "zod";

const node = z.object({
  id: z.string(),
  /** Unused since Netdata was removed; kept so older hub.yaml files still parse. */
  netdata: z.string().url().optional(),
  /** The machine's name on the tailnet, when it differs from `id`. */
  tailscale: z.string().optional(),
  /** Prometheus `instance` label of its node-exporter, when its hostname differs from `id`. */
  instance: z.string().optional(),
});

const space = z.object({
  id: z.string(),
  name: z.string(),
  color: z.enum(["blue", "green", "purple", "amber", "red", "gray"]).default("gray"),
});

const service = z.object({
  name: z.string(),
  node: z.string().default("core-01"),
  url: z.string().url(),
  health: z.string().url().optional(),
  space: z.string().optional(),
  /** Response time above this is "slow", ms. */
  slow_ms: z.number().int().positive().default(1500),
});

const field = z.object({ name: z.string(), type: z.enum(["text", "number", "date"]).default("text") });

const action = z.object({
  id: z.string(),
  label: z.string(),
  webhook: z.string().url(),
  fields: z.array(field).default([]),
});

const inboxRule = z.object({
  match: z.record(z.string(), z.string()),
  route: z.enum(["needs_action", "fyi", "snoozed"]),
  push: z.enum(["phone", "none"]).default("none"),
});

export const hubConfigSchema = z.object({
  nodes: z.array(node).default([]),
  /** n8n: `url` is how the hub reaches its API (key in N8N_API_KEY); `public_url` is where links go. */
  n8n: z
    .object({
      url: z.string().url().default("http://n8n:5678"),
      public_url: z.string().url().default("https://n8n.mesh.net"),
    })
    .prefault({}),
  /** Prometheus with node-exporter metrics, for the node tiles. */
  prometheus: z.string().url().optional(),
  spaces: z.array(space).default([]),
  services: z.array(service).default([]),
  actions: z.array(action).default([]),
  inbox_rules: z.array(inboxRule).default([]),
  ui: z
    .object({
      theme: z.enum(["dark", "light", "system"]).default("dark"),
      density: z.enum(["comfortable", "compact"]).default("comfortable"),
    })
    .prefault({}),
});

export type HubConfig = z.infer<typeof hubConfigSchema>;
export type InboxRule = HubConfig["inbox_rules"][number];

/** Parse hub.yaml text. Throws a ZodError naming the bad path. */
export function parseHubConfig(text: string): HubConfig {
  return hubConfigSchema.parse(parse(text) ?? {});
}
