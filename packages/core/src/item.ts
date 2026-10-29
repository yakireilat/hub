import type { Status } from "./status";

export type Route = "needs_action" | "fyi" | "snoozed";

/** A button on an item. Every action is also a palette command and (phase 7) an API endpoint. */
export interface ItemAction {
  id: string;
  label: string;
  primary?: boolean;
}

/** The one shape every visible record takes: event, run, alert, note, service. */
export interface Item {
  /** Unique across adapters: `<source>:<native id>`. */
  id: string;
  source: string;
  kind: "event" | "run" | "alert" | "note" | "service" | "invite";
  title: string;
  /** One line of context, shown under the title. */
  context: string;
  /** ISO 8601. */
  time: string;
  status: Status;
  /** Overrides the status word, e.g. "Invite" or "23 succeeded". */
  statusLabel?: string;
  route: Route;
  /** At most two; enforced by `limitActions`. */
  actions: ItemAction[];
  /** Deep link into the real app. */
  href: string;
  /** Free-form fields an adapter needs (event end, service node, …). */
  meta?: Record<string, string | number | boolean>;
}

export const MAX_ACTIONS = 2;

export function limitActions(item: Item): Item {
  return item.actions.length <= MAX_ACTIONS ? item : { ...item, actions: item.actions.slice(0, MAX_ACTIONS) };
}
