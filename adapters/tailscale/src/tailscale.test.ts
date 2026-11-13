import { describe, expect, it } from "vitest";
import { createTailscaleReader } from "./index";

const NOW = Date.UTC(2026, 10, 13, 18, 0);

describe("tailscale reader", () => {
  it("gets a token once, then reads presence keyed by short name", async () => {
    const calls: string[] = [];
    const fetchFn: typeof fetch = async (input, init) => {
      const url = String(input);
      calls.push(url);
      if (url.endsWith("/oauth/token")) {
        expect(String(init?.body)).toContain("client_id=id");
        return Response.json({ access_token: "tok", expires_in: 3600 });
      }
      expect((init?.headers as Record<string, string>).authorization).toBe("Bearer tok");
      return Response.json({
        devices: [
          { name: "core-01.tail1234.ts.net", hostname: "core-01", addresses: ["100.100.101.1"], os: "linux", lastSeen: new Date(NOW - 10_000).toISOString(), connectedToControl: true },
          { name: "niflheim.tail1234.ts.net", hostname: "NIFLHEIM", os: "windows", lastSeen: new Date(NOW - 3 * 3600_000).toISOString() },
        ],
      });
    };
    const ts = createTailscaleReader({ clientId: "id", clientSecret: "secret", fetchFn, now: () => NOW });
    const p = await ts.presence();
    await ts.presence();
    expect(calls.filter((c) => c.endsWith("/oauth/token"))).toHaveLength(1);
    expect(p.get("core-01")).toEqual({ online: true, lastSeen: NOW - 10_000, address: "100.100.101.1", os: "linux" });
    expect(p.get("niflheim")).toMatchObject({ online: false, lastSeen: NOW - 3 * 3600_000 });
  });

  it("explains a rejected client", async () => {
    const ts = createTailscaleReader({ clientId: "id", clientSecret: "bad", fetchFn: async () => new Response(null, { status: 401 }) });
    await expect(ts.presence()).rejects.toThrow("HTTP 401");
  });
});
