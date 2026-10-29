"use client";

import { statusShape, statusWord, type Item as ItemModel, type Status } from "@hub/core";
import { hhmm } from "@/lib/format";
import { ItemActions } from "./ItemActions";

export const statusText: Record<Status, string> = {
  up: "text-st-up",
  slow: "text-st-slow",
  failed: "text-st-failed",
  info: "text-st-info",
  idle: "text-st-idle",
};

/** Every visible record renders through this: shape + word status, title, one context line, time, ≤2 actions. */
export function Item({ item, variant = "card" }: { item: ItemModel; variant?: "card" | "row" }) {
  const word = item.statusLabel ?? statusWord[item.status];
  const shell =
    variant === "card"
      ? "flex gap-3 rounded-xl border border-line bg-surface p-3.5"
      : "flex min-h-11 items-center gap-3 py-1.5";

  return (
    <article className={shell} data-testid="item" data-item-id={item.id}>
      <span
        aria-hidden="true"
        className={`flex size-8 flex-none items-center justify-center rounded-lg bg-raised text-xs ${statusText[item.status]}`}
      >
        {statusShape[item.status]}
      </span>
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <div className="flex justify-between gap-2">
          <h3 className="font-medium">{item.title}</h3>
          <time dateTime={item.time} className="font-mono text-xs text-muted">
            {hhmm(item.time)}
          </time>
        </div>
        <p className="text-[13px] text-muted">
          <span className={statusText[item.status]}>{word}</span> · {item.context}
        </p>
        {item.actions.length > 0 && <ItemActions itemId={item.id} actions={item.actions} href={item.href} />}
      </div>
    </article>
  );
}
