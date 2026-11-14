import type { InboxRule } from "./config";
import type { Item } from "./item";
import { describeRule } from "./rules";

/** The Inbox holds things that happened, not things that just are: runs, alerts, invites, services in trouble. */
export function isInboxItem(i: Item): boolean {
  if (i.kind === "run" || i.kind === "alert" || i.kind === "invite") return true;
  return i.kind === "service" && (i.status === "failed" || i.status === "slow");
}

/** Snoozed items move to the Snoozed tab until `until` (epoch ms), then come back by themselves. */
export function applySnoozes(items: Item[], snoozes: Map<string, number>, now: number): Item[] {
  return items.map((item) => {
    const until = snoozes.get(item.id);
    return until && until > now ? { ...item, route: "snoozed", meta: { ...item.meta, snoozedUntil: until } } : item;
  });
}

export interface InboxEntry {
  item: Item;
  /** The hub.yaml rule that routed it, in words; null when the adapter's own default applies. */
  rule: string | null;
  /** Epoch ms; null unless snoozed. */
  snoozedUntil: number | null;
}

export interface InboxPayload {
  entries: InboxEntry[];
  /** Every source with something in the Inbox, for the filter chips. */
  sources: string[];
}

const newestFirst = (a: InboxEntry, b: InboxEntry) => b.item.time.localeCompare(a.item.time);

export function buildInbox(items: Item[], rules: InboxRule[]): InboxPayload {
  const entries = items.filter(isInboxItem).map((item) => {
    const r = typeof item.meta?.rule === "number" ? rules[item.meta.rule] : undefined;
    const until = item.meta?.snoozedUntil;
    return { item, rule: r ? describeRule(r) : null, snoozedUntil: typeof until === "number" ? until : null };
  });
  return { entries: entries.sort(newestFirst), sources: [...new Set(entries.map((e) => e.item.source))].sort() };
}

/** Tomorrow at 09:00 local time, the default "later" for a snooze. */
export function tomorrowMorning(now: Date): number {
  const d = new Date(now);
  d.setDate(d.getDate() + 1);
  d.setHours(9, 0, 0, 0);
  return d.getTime();
}
