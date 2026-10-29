import type { InboxRule } from "./config";
import type { Item } from "./item";

/** Fields a rule can match on. `status` matches either the status or the kind-specific label. */
function fieldOf(item: Item, key: string): string | undefined {
  switch (key) {
    case "source":
      return item.source;
    case "status":
      return item.status === "failed" ? "error" : item.status;
    case "kind":
      return item.kind;
    default: {
      const v = item.meta?.[key];
      return v === undefined ? undefined : String(v);
    }
  }
}

/** First matching rule wins; an item no rule matches keeps the route its adapter gave it. */
export function applyRules(items: Item[], rules: InboxRule[]): Item[] {
  return items.map((item) => {
    const rule = rules.find((r) => Object.entries(r.match).every(([k, v]) => fieldOf(item, k) === v));
    return rule ? { ...item, route: rule.route } : item;
  });
}
