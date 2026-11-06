"use client";

import { STATUSES, statusShape, statusWord, type Item as ItemModel } from "@hub/core";
import { Item, statusText } from "@/components/item/Item";
import { useHub } from "@/components/shell/HubProvider";

export default function ServicesPage() {
  const { today, error } = useHub();

  if (error && !today) {
    return (
      <p role="alert" className="rounded-xl border border-line bg-surface p-4">
        <span className="text-st-failed">■ Can&apos;t reach the hub.</span> <span className="text-muted">{error}</span>
      </p>
    );
  }
  if (!today) return <div aria-busy="true" aria-label="Loading services" className="h-64 animate-pulse rounded-xl bg-surface" />;

  const services = today.services;
  const byNode = new Map<string, ItemModel[]>();
  for (const s of services) {
    const node = String(s.meta?.node ?? s.context.split(" · ")[0]);
    byNode.set(node, [...(byNode.get(node) ?? []), s]);
  }
  // Problems first inside each node, so the eye lands on what is wrong.
  const rank = (s: ItemModel) => ["failed", "slow"].indexOf(s.status) + 1 || 3;

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-baseline gap-3.5">
        <h1 className="text-[30px] font-semibold tracking-tight">Services</h1>
        <p className="text-muted">
          {STATUSES.filter((st) => services.some((s) => s.status === st))
            .map((st) => (
              <span key={st} className={statusText[st]}>
                {statusShape[st]} {services.filter((s) => s.status === st).length} {statusWord[st].toLowerCase()}
              </span>
            ))
            .flatMap((el, i) => (i ? [" · ", el] : [el]))}
        </p>
      </div>

      {[...byNode].map(([node, list]) => (
        <section key={node} aria-labelledby={`node-${node}`} className="flex flex-col rounded-xl border border-line bg-surface px-4 py-2">
          <h2 id={`node-${node}`} className="label-caps py-2">
            {node}
          </h2>
          {list
            .sort((a, b) => rank(a) - rank(b) || a.title.localeCompare(b.title))
            .map((s) => (
              // The <article> inside gives the link no accessible name, so it needs its own label.
              <a
                key={s.id}
                href={s.href}
                aria-label={`${s.title}: ${s.statusLabel ?? statusWord[s.status]}, ${s.context}`}
                className="block rounded-lg text-fg hover:bg-raised"
              >
                <Item item={s} variant="row" />
              </a>
            ))}
        </section>
      ))}
    </div>
  );
}
