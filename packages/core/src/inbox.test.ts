import { describe, expect, it } from "vitest";
import { parseHubConfig } from "./config";
import { createHub } from "./hub";
import { applySnoozes, buildInbox, isInboxItem, tomorrowMorning } from "./inbox";
import type { Item } from "./item";
import { applyRules, describeRule } from "./rules";

const item = (over: Partial<Item>): Item => ({
  id: "x:1", source: "x", kind: "alert", title: "T", context: "", time: "2026-11-14T10:00:00Z",
  status: "info", route: "fyi", actions: [], href: "https://x.test", ...over,
});

const rules = parseHubConfig(
  "inbox_rules:\n  - match: { source: checks, status: error, node: core-01 }\n    route: needs_action\n    push: phone\n",
).inbox_rules;

describe("inbox", () => {
  it("holds runs, alerts, invites and services in trouble, not events, notes or healthy services", () => {
    expect([
      item({ kind: "run" }), item({ kind: "invite" }), item({ kind: "event" }), item({ kind: "note" }),
      item({ kind: "service", status: "up" }), item({ kind: "service", status: "slow" }),
    ].map(isInboxItem)).toEqual([true, true, false, false, false, true]);
  });

  it("says which rule routed an item", () => {
    const [down] = applyRules([item({ id: "checks:gitea", source: "checks", kind: "service", status: "failed", meta: { node: "core-01" } })], rules);
    const inbox = buildInbox([down!], rules);
    expect(inbox.entries[0]).toMatchObject({ rule: "source = checks, status = error, node = core-01 → Needs action, push: phone", snoozedUntil: null });
    expect(inbox.entries[0]?.item.route).toBe("needs_action");
    expect(describeRule(rules[0]!)).toContain("→ Needs action");
  });

  it("snoozes until a time, then lets the item come back", () => {
    const snoozes = new Map([["x:1", 2_000]]);
    expect(applySnoozes([item({ route: "needs_action" })], snoozes, 1_000)[0]).toMatchObject({ route: "snoozed", meta: { snoozedUntil: 2_000 } });
    expect(applySnoozes([item({ route: "needs_action" })], snoozes, 3_000)[0]?.route).toBe("needs_action");
  });

  it("keeps a snoozed item out of Today's needs through the hub overlay", async () => {
    const adapter = { id: "x", name: "X", read: async () => [item({ kind: "run", route: "needs_action" })], act: async () => ({ ok: true, message: "" }), link: (i: Item) => i.href };
    const hub = createHub([adapter], [], (items) => applySnoozes(items, new Map([["x:1", Date.now() + 60_000]]), Date.now()));
    expect((await hub.today()).verdict).toBe("Nothing needs you");
  });

  it("tomorrow morning is 09:00 the next day", () => {
    const t = new Date(tomorrowMorning(new Date(2026, 10, 14, 22, 30)));
    expect([t.getDate(), t.getHours(), t.getMinutes()]).toEqual([15, 9, 0]);
  });
});
