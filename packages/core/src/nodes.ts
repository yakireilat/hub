/** What node-exporter says about a machine right now. Shares are 0–100. */
export interface NodeMetrics {
  cpu: number | null;
  memory: number | null;
  memoryTotalBytes: number | null;
  disk: number | null;
  /** Hottest sensor, °C. */
  tempC: number | null;
}

/** What the tailnet says about a machine. */
export interface NodePresence {
  online: boolean;
  /** Epoch ms. */
  lastSeen: number | null;
  address?: string;
  os?: string;
}

export interface NodeView {
  id: string;
  /** null when Tailscale isn't configured or the machine isn't on the tailnet. */
  presence: NodePresence | null;
  /** null when Prometheus isn't configured or has no node-exporter for it. */
  metrics: NodeMetrics | null;
  /** How many hub services run on it, and how many of those are failing. */
  services: number;
  failing: number;
}

export interface NodesPayload {
  nodes: NodeView[];
  /** Which sources answered, so the screen can say what is missing. */
  sources: { tailscale: "ok" | "off" | "error"; prometheus: "ok" | "off" | "error" };
  /** node-exporters Prometheus reports that no node matched, so the screen can say what to set. */
  unmatchedExporters: { instance: string; hostname: string | null }[];
  sample: boolean;
}

/** Lower-cased; a host name loses its domain ("core-01.tail1234.ts.net" → "core-01"), an IP address doesn't. */
const norm = (s: string) => {
  const x = s.toLowerCase();
  return /^\d+\.\d+\.\d+\.\d+(:\d+)?$/.test(x) ? x : x.replace(/\..*$/, "");
};

/** Looks a node up by its configured alias, else by its id, ignoring case and any domain suffix. */
export function pick<T>(byName: Map<string, T>, id: string, alias?: string): T | undefined {
  return (alias ? (byName.get(alias.toLowerCase()) ?? byName.get(norm(alias))) : undefined) ?? byName.get(norm(id));
}

export const nodeKey = norm;
