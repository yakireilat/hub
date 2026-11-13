import { describe, expect, it } from "vitest";
import { nodeMetrics } from "./index";

const vec = (rows: [Record<string, string>, number][]) =>
  Response.json({ status: "success", data: { resultType: "vector", result: rows.map(([metric, v]) => ({ metric, value: [0, String(v)] })) } });

describe("nodeMetrics", () => {
  it("collects node-exporter values per instance and maps them to hostnames", async () => {
    const fetchFn: typeof fetch = async (input) => {
      const q = decodeURIComponent(String(input).split("query=")[1]!);
      if (q === "node_uname_info") return vec([[{ instance: "node-exporter:9100", nodename: "core-01" }, 1]]);
      if (q.includes("node_cpu_seconds_total")) return vec([[{ instance: "node-exporter:9100" }, 34.2]]);
      if (q.startsWith("100 * (1 - node_memory")) return vec([[{ instance: "node-exporter:9100" }, 71]]);
      if (q === "node_memory_MemTotal_bytes") return vec([[{ instance: "node-exporter:9100" }, 8e9]]);
      if (q.includes("node_filesystem")) return vec([[{ instance: "node-exporter:9100" }, 18]]);
      return vec([]); // no temperature sensors
    };
    const { byName: m, exporters } = await nodeMetrics("http://prometheus:9090", fetchFn);
    expect(m.get("core-01")).toEqual({ cpu: 34.2, memory: 71, memoryTotalBytes: 8e9, disk: 18, tempC: null });
    expect(m.get("node-exporter:9100")).toBe(m.get("core-01"));
    expect(exporters).toEqual([{ instance: "node-exporter:9100", hostname: "core-01", metrics: m.get("core-01") }]);
  });

  it("fails loudly when Prometheus is down", async () => {
    await expect(nodeMetrics("http://prometheus:9090", async () => new Response(null, { status: 503 }))).rejects.toThrow("HTTP 503");
  });
});
