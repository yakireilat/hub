import { nodeKey, type NodeMetrics } from "@hub/core";

/** node-exporter queries, one value per instance. Disk is the root filesystem. */
const QUERIES = {
  cpu: '100 * (1 - avg by (instance) (rate(node_cpu_seconds_total{mode="idle"}[5m])))',
  memory: "100 * (1 - node_memory_MemAvailable_bytes / node_memory_MemTotal_bytes)",
  memoryTotalBytes: "node_memory_MemTotal_bytes",
  disk: '100 * (1 - max by (instance) (node_filesystem_avail_bytes{mountpoint="/",fstype!="rootfs"}) / max by (instance) (node_filesystem_size_bytes{mountpoint="/",fstype!="rootfs"}))',
  tempC: "max by (instance) (node_hwmon_temp_celsius) or max by (instance) (node_thermal_zone_temp)",
} as const;

interface Sample {
  metric: Record<string, string>;
  value: [number, string];
}

async function query(base: string, q: string, fetchFn: typeof fetch): Promise<Sample[]> {
  const res = await fetchFn(`${base.replace(/\/$/, "")}/api/v1/query?query=${encodeURIComponent(q)}`, {
    signal: AbortSignal.timeout(8_000),
  });
  if (!res.ok) throw new Error(`Prometheus answered HTTP ${res.status}`);
  const body = (await res.json()) as { status: string; data?: { result: Sample[] } };
  if (body.status !== "success") throw new Error("Prometheus query failed");
  return body.data?.result ?? [];
}

/**
 * Current metrics per machine. Keyed both by the node-exporter `instance` label and by the
 * machine's hostname (from node_uname_info), so nodes match by name without configuration.
 */
export async function nodeMetrics(base: string, fetchFn: typeof fetch = fetch): Promise<Map<string, NodeMetrics>> {
  const keys = Object.keys(QUERIES) as (keyof typeof QUERIES)[];
  const [uname, ...results] = await Promise.all([
    query(base, "node_uname_info", fetchFn),
    ...keys.map((k) => query(base, QUERIES[k], fetchFn)),
  ]);
  const byInstance = new Map<string, NodeMetrics>();
  results.forEach((samples, i) => {
    for (const s of samples) {
      const inst = s.metric.instance;
      if (!inst) continue;
      const m = byInstance.get(inst) ?? { cpu: null, memory: null, memoryTotalBytes: null, disk: null, tempC: null };
      const v = Number(s.value[1]);
      m[keys[i]!] = Number.isFinite(v) ? v : null;
      byInstance.set(inst, m);
    }
  });
  const out = new Map<string, NodeMetrics>();
  for (const [inst, m] of byInstance) {
    out.set(inst.toLowerCase(), m);
    out.set(nodeKey(inst.replace(/:\d+$/, "")), m);
  }
  for (const s of uname) {
    const m = s.metric.instance ? byInstance.get(s.metric.instance) : undefined;
    if (m && s.metric.nodename) out.set(nodeKey(s.metric.nodename), m);
  }
  return out;
}
