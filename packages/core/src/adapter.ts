import type { Item } from "./item";

export interface ActResult {
  ok: boolean;
  message: string;
}

/** A palette command an adapter contributes. */
export interface Command {
  id: string;
  label: string;
  /** Extra words the palette matches on. */
  keywords?: string[];
  scope: Scope;
  /** Present when running the command acts through the adapter. */
  action?: { itemId?: string; actionId: string };
  /** Present when the command navigates. */
  href?: string;
}

export type Scope = "action" | "note" | "calendar" | "service" | "nav";

/**
 * The adapter contract: read, act, listen, link. The UI never talks to a service directly,
 * so adding a service never changes a screen.
 */
export interface Adapter {
  id: string;
  name: string;
  /** Pull the current items. */
  read(): Promise<Item[]>;
  /** Do something to an item, e.g. retry a run or accept an invite. */
  act(itemId: string, actionId: string, input?: Record<string, unknown>): Promise<ActResult>;
  /** Subscribe to live events. Returns an unsubscribe function. */
  listen?(emit: (item: Item) => void): () => void;
  /** Deep link into the real app. */
  link(item: Item): string;
  /** Palette commands beyond the per-item actions. */
  commands?(): Command[];
}
