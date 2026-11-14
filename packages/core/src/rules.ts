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

/**
 * First matching rule wins; an item no rule matches keeps the route its adapter gave it. The
 * matching rule's index is kept in `meta.rule`, so the Inbox can say why an item is where it is.
 */
export function applyRules(items: Item[], rules: InboxRule[]): Item[] {
  return items.map((item) => {
    const i = rules.findIndex((r) => Object.entries(r.match).every(([k, v]) => fieldOf(item, k) === v));
    return i < 0 ? item : { ...item, route: rules[i]!.route, meta: { ...item.meta, rule: i } };
  });
}

const ROUTE_WORD = { needs_action: "Needs action", fyi: "FYI", snoozed: "Snoozed" } as const;

/** "source = n8n, status = error → Needs action, push: phone" */
export function describeRule(rule: InboxRule): string {
  const when = Object.entries(rule.match)
    .map(([k, v]) => `${k} = ${v}`)
    .join(", ");
  return `${when} → ${ROUTE_WORD[rule.route]}${rule.push !== "none" ? `, push: ${rule.push}` : ""}`;
}
