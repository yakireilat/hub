"use client";

import { tomorrowMorning, type InboxEntry, type InboxPayload, type Route } from "@hub/core";
import { useCallback, useEffect, useState, useTransition } from "react";
import { Item } from "@/components/item/Item";
import { useHub } from "@/components/shell/HubProvider";
import { useToast } from "@/components/shell/Toast";
import { hhmm, longDay } from "@/lib/format";

const TABS: { route: Route; label: string }[] = [
  { route: "needs_action", label: "Needs action" },
  { route: "fyi", label: "FYI" },
  { route: "snoozed", label: "Snoozed" },
];

const SOURCE_NAME: Record<string, string> = { n8n: "n8n", checks: "Services", calendar: "Calendar", vault: "Notes" };
const sourceName = (s: string) => SOURCE_NAME[s] ?? s;

const DEFAULT_ROUTE: Record<Route, string> = {
  needs_action: "Needs action",
  fyi: "FYI",
  snoozed: "Snoozed",
};

function when(ms: number) {
  const d = new Date(ms);
  const sameDay = new Date().toDateString() === d.toDateString();
  return sameDay ? `today ${hhmm(d)}` : `${longDay(d)} ${hhmm(d)}`;
}

function Detail({ entry, onChanged }: { entry: InboxEntry; onChanged: () => void }) {
  const { client, refresh } = useHub();
  const toast = useToast();
  const [pending, start] = useTransition();
  const { item } = entry;

  const run = (fn: () => Promise<{ ok: boolean; message: string }>) =>
    start(async () => {
      toast(await fn());
      onChanged();
      void refresh();
    });

  return (
    <aside aria-label="Item detail" className="flex flex-col gap-4">
      <Item item={item} />
      <div className="flex flex-wrap gap-2">
        {entry.snoozedUntil ? (
          <button
            type="button"
            disabled={pending}
            onClick={() => run(() => client.unsnooze(item.id))}
            className="min-h-11 rounded-lg border border-line px-3.5 text-sm text-fg hover:bg-raised disabled:opacity-60"
          >
            Unsnooze
          </button>
        ) : (
          <>
            <button
              type="button"
              disabled={pending}
              onClick={() => run(() => client.snooze(item.id, Date.now() + 3_600_000))}
              className="min-h-11 rounded-lg border border-line px-3.5 text-sm text-fg hover:bg-raised disabled:opacity-60"
            >
              Snooze 1 h
            </button>
            <button
              type="button"
              disabled={pending}
              onClick={() => run(() => client.snooze(item.id, tomorrowMorning(new Date())))}
              className="min-h-11 rounded-lg border border-line px-3.5 text-sm text-fg hover:bg-raised disabled:opacity-60"
            >
              Until tomorrow 09:00
            </button>
          </>
        )}
        <a
          href={item.href}
          target="_blank"
          rel="noreferrer"
          className="inline-flex min-h-11 items-center rounded-lg border border-line px-3.5 text-sm text-fg hover:bg-raised"
        >
          Open in {sourceName(item.source)}
        </a>
      </div>
      <section aria-labelledby="why" className="flex flex-col gap-1.5 rounded-xl border border-line bg-surface p-4">
        <h3 id="why" className="label-caps">
          Why it&apos;s here
        </h3>
        {entry.snoozedUntil && <p className="text-sm">◌ Snoozed until {when(entry.snoozedUntil)}.</p>}
        {entry.rule ? (
          <p className="font-mono text-[13px] text-fg-soft">{entry.rule}</p>
        ) : (
          <p className="text-sm text-muted">
            No rule in hub.yaml matched, so it stays where {sourceName(item.source)} puts it
            {entry.snoozedUntil ? "" : `: ${DEFAULT_ROUTE[item.route]}`}.
          </p>
        )}
      </section>
    </aside>
  );
}

export default function InboxPage() {
  const { client, today } = useHub();
  const [data, setData] = useState<InboxPayload | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<Route>("needs_action");
  const [source, setSource] = useState<string | null>(null);
  const [selected, setSelected] = useState<string | null>(null);

  const reload = useCallback(async () => {
    try {
      setData(await client.inbox());
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }, [client]);
  // Reload on a timer, and whenever Today changes (e.g. after Retry), so both agree.
  useEffect(() => {
    void reload();
    const t = window.setInterval(() => void reload(), 30_000);
    return () => window.clearInterval(t);
  }, [reload, today]);

  if (error && !data) {
    return (
      <p role="alert" className="rounded-xl border border-line bg-surface p-4">
        <span className="text-st-failed">■ Can&apos;t reach the hub.</span> <span className="text-muted">{error}</span>
      </p>
    );
  }
  if (!data) return <div aria-busy="true" aria-label="Loading the Inbox" className="h-64 animate-pulse rounded-xl bg-surface" />;

  const count = (r: Route) => data.entries.filter((e) => e.item.route === r).length;
  const shown = data.entries.filter((e) => e.item.route === tab && (!source || e.item.source === source));
  const current = shown.find((e) => e.item.id === selected) ?? shown[0];

  return (
    <div className="flex flex-col gap-5">
      <h1 className="text-[30px] font-semibold tracking-tight">Inbox</h1>

      <div role="tablist" aria-label="Inbox views" className="flex flex-wrap gap-2">
        {TABS.map((t) => (
          <button
            key={t.route}
            type="button"
            role="tab"
            aria-selected={tab === t.route}
            onClick={() => {
              setTab(t.route);
              setSelected(null);
            }}
            className={`min-h-11 rounded-lg border px-3.5 ${tab === t.route ? "border-accent bg-accent/10 text-accent-soft" : "border-line text-fg-soft"}`}
          >
            {t.label} <span className="font-mono text-xs text-muted">{count(t.route)}</span>
          </button>
        ))}
      </div>

      {data.sources.length > 1 && (
        <div role="group" aria-label="Sources" className="flex flex-wrap items-center gap-2 text-[13px]">
          <span className="text-muted">Sources</span>
          {[null, ...data.sources].map((s) => (
            <button
              key={s ?? "all"}
              type="button"
              aria-pressed={source === s}
              onClick={() => setSource(s)}
              className={`min-h-9 rounded-full border px-3 ${source === s ? "border-accent text-accent-soft" : "border-line text-fg-soft"}`}
            >
              {s ? sourceName(s) : "All"}
            </button>
          ))}
        </div>
      )}

      <div className="flex flex-wrap items-start gap-5">
        <section aria-label="Inbox items" className="flex min-w-0 flex-[1_1_420px] flex-col gap-1">
          {shown.length === 0 ? (
            <p className="rounded-xl border border-line bg-surface p-4 text-muted">
              {tab === "needs_action" ? (
                <>
                  <span className="text-st-up">● All clear.</span> Nothing needs you.
                </>
              ) : tab === "snoozed" ? (
                "Nothing is snoozed."
              ) : (
                "Nothing here."
              )}
            </p>
          ) : (
            shown.map((e) => (
              <button
                key={e.item.id}
                type="button"
                aria-pressed={current?.item.id === e.item.id}
                aria-label={`${e.item.title}, ${e.item.context}`}
                onClick={() => setSelected(e.item.id)}
                className={`block w-full rounded-lg border px-3 text-left ${current?.item.id === e.item.id ? "border-line bg-raised" : "border-transparent hover:bg-surface"}`}
              >
                {/* Actions live in the detail pane: no buttons inside this button. */}
                <Item item={{ ...e.item, actions: [] }} variant="row" />
              </button>
            ))
          )}
        </section>
        {current && (
          <div className="min-w-0 flex-[1_1_360px]">
            <Detail entry={current} onChanged={() => void reload()} />
          </div>
        )}
      </div>
    </div>
  );
}
