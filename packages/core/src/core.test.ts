import { describe, expect, it } from "vitest";
import type { Adapter } from "./adapter";
import { parseHubConfig } from "./config";
import { createHub } from "./hub";
import type { Item } from "./item";
import { parseQuery } from "./query";
import { applyRules } from "./rules";
import { verdict } from "./today";

const item = (over: Partial<Item>): Item => ({
  id: "x:1",
  source: "x",
  kind: "alert",
  title: "T",
  context: "",
  time: "2026-10-29T10:00:00Z",
  status: "info",
  route: "fyi",
  actions: [],
  href: "https://example.test",
  ...over,
});

describe("verdict", () => {
  it("counts only needs-action items", () => {
    expect(verdict([])).toBe("Nothing needs you");
    expect(verdict([item({ route: "needs_action" })])).toBe("One thing needs you");
    expect(verdict([item({ route: "needs_action" }), item({ route: "needs_action" }), item({})])).toBe(
      "Two things need you",
    );
  });
});

describe("parseQuery", () => {
  it("reads scope prefixes", () => {
    expect(parseQuery("> retry")).toEqual({ scope: "action", text: "retry" });
    expect(parseQuery("#backup")).toEqual({ scope: "note", text: "backup" });
    expect(parseQuery("@")).toEqual({ scope: "calendar", text: "" });
    expect(parseQuery("/ jelly")).toEqual({ scope: "service", text: "jelly" });
    expect(parseQuery(" plain ")).toEqual({ scope: "all", text: "plain" });
  });
});

describe("hub.yaml", () => {
  it("fills defaults", () => {
    const c = parseHubConfig("services:\n  - name: n8n\n    url: https://n8n.mesh.net\n");
    expect(c.services[0]).toMatchObject({ node: "core-01", slow_ms: 1500 });
    expect(c.ui).toEqual({ theme: "dark", density: "comfortable" });
    expect(parseHubConfig("")).toMatchObject({ nodes: [], inbox_rules: [] });
  });

  it("rejects a bad url", () => {
    expect(() => parseHubConfig("services:\n  - name: x\n    url: not-a-url\n")).toThrow();
  });
});

describe("inbox rules", () => {
  it("first match wins and failed matches status: error", () => {
    const rules = parseHubConfig(
      "inbox_rules:\n  - match: { source: n8n, status: error }\n    route: needs_action\n  - match: { source: n8n }\n    route: snoozed\n",
    ).inbox_rules;
    const [failed, ok] = applyRules(
      [item({ source: "n8n", status: "failed" }), item({ source: "n8n", status: "up" })],
      rules,
    );
    expect(failed?.route).toBe("needs_action");
    expect(ok?.route).toBe("snoozed");
  });
});

describe("createHub", () => {
  const good: Adapter = {
    id: "good",
    name: "Good",
    read: async () => [
      item({ id: "good:1", source: "good", actions: [{ id: "a", label: "A" }, { id: "b", label: "B" }, { id: "c", label: "C" }] }),
    ],
    act: async (itemId, actionId) => ({ ok: true, message: `${actionId} on ${itemId}` }),
    link: (i) => i.href,
  };
  const broken: Adapter = { ...good, id: "broken", read: async () => Promise.reject(new Error("down")) };

  it("survives a broken adapter and caps actions at two", async () => {
    const items = await createHub([good, broken]).items();
    expect(items).toHaveLength(1);
    expect(items[0]?.actions).toHaveLength(2);
  });

  it("routes act to the item's adapter", async () => {
    const hub = createHub([good]);
    expect(await hub.act("good:1", "a")).toEqual({ ok: true, message: "a on good:1" });
    expect((await hub.act("nope:1", "a")).ok).toBe(false);
  });

  it("turns item actions into palette commands", async () => {
    const cmds = await createHub([good]).commands();
    expect(cmds.map((c) => c.label)).toEqual(["A: T", "B: T"]);
    expect(cmds.every((c) => c.href === "https://example.test")).toBe(true);
  });

  it("makes an open action a link, not an adapter call", async () => {
    const withOpen: Adapter = { ...good, read: async () => [item({ id: "good:2", source: "good", actions: [{ id: "open", label: "Open" }] })] };
    const [cmd] = await createHub([withOpen]).commands();
    expect(cmd?.action).toBeUndefined();
    expect(cmd?.href).toBe("https://example.test");
  });
});
