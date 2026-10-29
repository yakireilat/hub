import type { Item } from "./item";

const WORDS = ["Nothing", "One thing", "Two things", "Three things", "Four things", "Five things"];

/** The one-line verdict Today opens with. */
export function verdict(items: Item[]): string {
  const n = items.filter((i) => i.route === "needs_action").length;
  if (n === 0) return "Nothing needs you";
  const head = WORDS[n] ?? `${n} things`;
  return `${head} need${n === 1 ? "s" : ""} you`;
}

export interface TodayView {
  verdict: string;
  needs: Item[];
  fyi: Item[];
  agenda: Item[];
  services: Item[];
  runs: { total: number; ok: number; failed: number };
  notes: Item[];
}

const byTime = (a: Item, b: Item) => a.time.localeCompare(b.time);
const newestFirst = (a: Item, b: Item) => b.time.localeCompare(a.time);

/** Assemble Today from every adapter's items. */
export function buildToday(items: Item[]): TodayView {
  const runs = items.filter((i) => i.kind === "run");
  return {
    verdict: verdict(items),
    needs: items.filter((i) => i.route === "needs_action").sort(newestFirst),
    fyi: items.filter((i) => i.route === "fyi"),
    agenda: items.filter((i) => i.kind === "event" || i.kind === "invite").sort(byTime),
    services: items.filter((i) => i.kind === "service"),
    runs: {
      total: runs.reduce((n, r) => n + Number(r.meta?.count ?? 1), 0),
      ok: runs.filter((r) => r.status === "up").reduce((n, r) => n + Number(r.meta?.count ?? 1), 0),
      failed: runs.filter((r) => r.status === "failed").reduce((n, r) => n + Number(r.meta?.count ?? 1), 0),
    },
    notes: items.filter((i) => i.kind === "note").sort(newestFirst),
  };
}
