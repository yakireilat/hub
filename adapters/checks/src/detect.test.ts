import type { ManagedService } from "@hub/core";
import { describe, expect, it } from "vitest";
import { detectService, toUrl } from "./detect";

const existing: ManagedService[] = [
  { id: "gitea", name: "Gitea", url: "https://git.mesh.net", node: "core-01", slow_ms: 1500, origin: "yaml" },
  { id: "sonarr", name: "Sonarr", url: "https://sonarr.mesh.net", health: "http://100.100.101.100:8989/", node: "niflheim", slow_ms: 1500, origin: "yaml" },
];

/** A fake network: path → response. Anything else is unreachable. */
const net =
  (routes: Record<string, () => Response>): typeof fetch =>
  async (input) => {
    const r = routes[String(input)];
    if (!r) throw new TypeError("fetch failed");
    return r();
  };

describe("toUrl", () => {
  it("turns a bare name into an address on the usual domain", () => {
    expect(toUrl("jellyfin", existing).href).toBe("https://jellyfin.mesh.net/");
    expect(toUrl("media.mesh.net", existing).href).toBe("https://media.mesh.net/");
    expect(toUrl("100.100.101.100:8096", existing).href).toBe("http://100.100.101.100:8096/");
  });
});

describe("detectService", () => {
  it("recognises an app by its host, fills its health check and guesses the node", async () => {
    const s = await detectService(
      "http://100.100.101.100:7878",
      existing,
      ["core-01", "niflheim"],
      net({
        "http://100.100.101.100:7878/": () => new Response("<title>Radarr</title>", { headers: { "content-type": "text/html" } }),
        "http://100.100.101.100:7878/ping": () => new Response("{}"),
      }),
    );
    expect(s).toMatchObject({
      name: "Radarr",
      known: "Radarr",
      url: "http://100.100.101.100:7878",
      health: "http://100.100.101.100:7878/ping",
      node: "niflheim",
      reachable: true,
    });
    expect(s.duplicateOf).toBeUndefined();
  });

  it("flags duplicates, sign-in redirects and dead addresses", async () => {
    const dup = await detectService("git", existing, ["core-01"], net({
      "https://git.mesh.net/": () => new Response(null, { status: 302, headers: { location: "https://auth.mesh.net/?rd=x" } }),
      "https://git.mesh.net/api/healthz": () => new Response(null, { status: 302 }),
    }));
    expect(dup).toMatchObject({ name: "Gitea", duplicateOf: "Gitea", reachable: true });
    expect(dup.notes.join(" ")).toMatch(/sign-in page/);

    const dead = await detectService("https://nothing.mesh.net", existing, ["core-01"], net({}));
    expect(dead).toMatchObject({ name: "Nothing", reachable: false, node: "core-01" });
    expect(dead.notes.join(" ")).toMatch(/didn't answer/);
  });

  it("uses the page title for unknown apps and skips probing without a fetch", async () => {
    const s = await detectService("https://wiki.mesh.net", existing, ["core-01"], net({
      "https://wiki.mesh.net/": () => new Response("<html><title>BookStack</title>", { headers: { "content-type": "text/html" } }),
    }));
    expect(s).toMatchObject({ name: "BookStack", reachable: true });
    expect(await detectService("jellyfin", existing, ["core-01"], null)).toMatchObject({
      name: "Jellyfin",
      health: "https://jellyfin.mesh.net/health",
      reachable: null,
    });
  });
});
