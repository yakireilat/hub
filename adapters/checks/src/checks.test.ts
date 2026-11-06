import { parseHubConfig } from "@hub/core";
import { describe, expect, it } from "vitest";
import { check, createChecksAdapter } from "./index";

const [svc] = parseHubConfig("services:\n  - name: Gitea\n    url: https://git.mesh.net\n    health: http://gitea:3000/api/healthz\n    slow_ms: 50\n").services;

const answer =
  (status: number, delay = 0): typeof fetch =>
  () =>
    new Promise((resolve) => setTimeout(() => resolve(new Response(null, { status })), delay));

describe("check", () => {
  it("maps answers to up, slow and failed", async () => {
    expect((await check(svc!, answer(200))).status).toBe("up");
    expect((await check(svc!, answer(302))).status).toBe("up");
    expect((await check(svc!, answer(200, 80))).status).toBe("slow");
    expect(await check(svc!, answer(502))).toMatchObject({ status: "failed", detail: "HTTP 502" });
    expect(await check(svc!, () => Promise.reject(new TypeError("fetch failed")))).toMatchObject({
      status: "failed",
      detail: "Unreachable",
    });
  });

  it("checks the health url when there is one", async () => {
    let asked = "";
    await check(svc!, (url) => ((asked = String(url)), Promise.resolve(new Response(null))));
    expect(asked).toBe("http://gitea:3000/api/healthz");
  });
});

describe("checks adapter", () => {
  it("returns one service item per service and reuses a fresh round", async () => {
    let calls = 0;
    const adapter = createChecksAdapter([svc!], () => (calls++, Promise.resolve(new Response(null))));
    const [item] = await adapter.read();
    expect(item).toMatchObject({ id: "checks:gitea", kind: "service", status: "up", href: "https://git.mesh.net", route: "fyi" });
    expect(item!.context).toMatch(/^core-01 · \d+ ms$/);
    await adapter.read();
    expect(calls).toBe(1);
  });
});
