"use client";

import type { ItemAction } from "@hub/core";
import { useTransition } from "react";
import { runAction } from "@/app/actions";
import { useToast } from "@/components/shell/Toast";

export function ItemActions({ itemId, actions, href }: { itemId: string; actions: ItemAction[]; href: string }) {
  const [pending, start] = useTransition();
  const toast = useToast();

  return (
    <div className="mt-1.5 flex flex-wrap gap-2">
      {actions.map((a) =>
        a.id === "open" ? (
          <a
            key={a.id}
            href={href}
            target="_blank"
            rel="noreferrer"
            className="inline-flex min-h-11 items-center rounded-lg border border-line px-3.5 text-sm text-fg hover:bg-raised"
          >
            {a.label}
          </a>
        ) : (
          <button
            key={a.id}
            type="button"
            disabled={pending}
            onClick={() => start(async () => toast(await runAction(itemId, a.id)))}
            className={
              a.primary
                ? "min-h-11 rounded-lg bg-accent px-3.5 text-sm font-semibold text-on-accent disabled:opacity-60"
                : "min-h-11 rounded-lg border border-line px-3.5 text-sm text-fg hover:bg-raised disabled:opacity-60"
            }
          >
            {a.label}
          </button>
        ),
      )}
    </div>
  );
}
