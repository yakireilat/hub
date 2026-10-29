import type { ActResult, Adapter, Command } from "./adapter";
import type { InboxRule } from "./config";
import { limitActions, type Item } from "./item";
import { applyRules } from "./rules";
import { buildToday, type TodayView } from "./today";

/** The one door the UI uses. It fans out to adapters and never exposes them directly. */
export interface Hub {
  items(): Promise<Item[]>;
  today(): Promise<TodayView>;
  commands(): Promise<Command[]>;
  act(itemId: string, actionId: string, input?: Record<string, unknown>): Promise<ActResult>;
}

export function createHub(adapters: Adapter[], rules: InboxRule[] = []): Hub {
  const bySource = new Map(adapters.map((a) => [a.id, a]));

  async function items(): Promise<Item[]> {
    // One slow or broken adapter must not blank the whole screen.
    const results = await Promise.allSettled(adapters.map((a) => a.read()));
    const all = results.flatMap((r) => (r.status === "fulfilled" ? r.value : []));
    return applyRules(all, rules).map(limitActions);
  }

  return {
    items,
    async today() {
      return buildToday(await items());
    },
    async commands() {
      const all = await items();
      const fromItems: Command[] = all.flatMap((item) =>
        item.actions.map((a) => ({
          id: `${item.id}#${a.id}`,
          label: `${a.label}: ${item.title}`,
          keywords: [item.source, item.kind],
          scope: "action" as const,
          // "open" is a link, not an adapter action; every command keeps the link for ⌘↵.
          action: a.id === "open" ? undefined : { itemId: item.id, actionId: a.id },
          href: item.href,
        })),
      );
      const fromRecords: Command[] = all
        .filter((i) => i.kind === "note" || i.kind === "event" || i.kind === "invite" || i.kind === "service")
        .map((i) => ({
          id: `open:${i.id}`,
          label: i.title,
          keywords: [i.context],
          scope: i.kind === "note" ? "note" : i.kind === "service" ? "service" : "calendar",
          href: i.href,
        }));
      return [...fromItems, ...fromRecords, ...adapters.flatMap((a) => a.commands?.() ?? [])];
    },
    async act(itemId, actionId, input) {
      const source = itemId.split(":")[0] ?? "";
      const adapter = bySource.get(source);
      if (!adapter) return { ok: false, message: `No adapter for "${source}"` };
      return adapter.act(itemId, actionId, input);
    },
  };
}
