"use client";

import type { CalendarEvent, CalendarPayload } from "@hub/core";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useCallback, useEffect, useState, useTransition } from "react";
import { EventEditor, eventItem, type EditorTarget } from "@/components/calendar/EventEditor";
import { addDays, clock, longDate, rangeLabel } from "@/components/calendar/time";
import { WeekGrid } from "@/components/calendar/WeekGrid";
import { Item } from "@/components/item/Item";
import { useHub } from "@/components/shell/HubProvider";
import { useToast } from "@/components/shell/Toast";

const NAV_BTN = "min-h-11 rounded-[10px] border border-line px-3 text-fg hover:bg-raised";

function Calendar() {
  const { client, refresh, today } = useHub();
  const toast = useToast();
  const params = useSearchParams();
  const router = useRouter();
  const week = params.get("week") ?? undefined;
  const [data, setData] = useState<CalendarPayload | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [editor, setEditor] = useState<EditorTarget | null>(params.has("new") ? { kind: "new" } : null);
  const [, start] = useTransition();

  const reload = useCallback(async () => {
    try {
      setData(await client.calendar(week));
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }, [client, week]);
  // Reload on a timer, on week change, and whenever Today changes (an invite answered there shows here too).
  useEffect(() => {
    void reload();
    const t = window.setInterval(() => void reload(), 120_000);
    return () => window.clearInterval(t);
  }, [reload, today]);

  const go = (w: string | null) => router.replace(w ? `/calendar?week=${w}` : "/calendar", { scroll: false });

  if (error && !data) {
    return (
      <p role="alert" className="rounded-xl border border-line bg-surface p-4">
        <span className="text-st-failed">■ Can&apos;t reach the hub.</span> <span className="text-muted">{error}</span>
      </p>
    );
  }
  if (!data) return <div aria-busy="true" aria-label="Loading the calendar" className="h-64 animate-pulse rounded-xl bg-surface" />;

  const flash = params.get("error") ?? data.error;
  const invites = data.days.flatMap((d) => d.events).filter((e) => e.response === "needsAction").length;
  const thisWeek = data.days.some((d) => d.date === data.today);
  const open = (e: CalendarEvent) => setEditor({ kind: "event", event: e });

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-center gap-x-3.5 gap-y-2">
        <h1 className="text-[30px] font-semibold tracking-tight">Calendar</h1>
        <p className="text-muted">
          {data.connected ? <span className="text-st-up">● Google Calendar</span> : <span className="text-st-idle">◌ Not connected</span>}
          {invites > 0 && <span className="text-st-info"> · ◆ {invites} to answer</span>}
        </p>
        <div className="ml-auto flex flex-wrap gap-2">
          {data.connected && (
            <button type="button" onClick={() => setEditor({ kind: "new" })} className="min-h-11 rounded-[10px] bg-accent px-3.5 font-semibold text-on-accent">
              New event
            </button>
          )}
          {data.connected ? (
            <button
              type="button"
              onClick={() =>
                start(async () => {
                  toast(await client.disconnectCalendar());
                  void reload();
                  void refresh();
                })
              }
              className={NAV_BTN}
            >
              Disconnect
            </button>
          ) : (
            data.configured &&
            client.calendarConnectHref && (
              <a href={client.calendarConnectHref} className="inline-flex min-h-11 items-center rounded-[10px] bg-accent px-3.5 font-semibold text-on-accent">
                Connect Google Calendar
              </a>
            )
          )}
        </div>
      </div>

      {params.has("connected") && !flash && (
        <p role="status" className="rounded-xl border border-line bg-surface p-4 text-[13px]">
          <span className="text-st-up">● Connected.</span> Today and this screen now show your Google Calendar.
        </p>
      )}
      {flash && (
        <p role="alert" className="rounded-xl border border-line bg-surface p-4 text-[13px]">
          <span className="text-st-failed">■ Google Calendar:</span>{" "}
          <span className="text-muted">
            {flash === "not-configured" ? "the hub has no Google credentials yet." : flash === "state-mismatch" ? "the sign-in didn't come back intact. Try Connect again." : flash}
          </span>
        </p>
      )}
      {data.sample && (
        <p className="rounded-xl border border-dashed border-line p-4 text-[13px] text-muted">
          {data.configured
            ? "These are sample events. Connect Google Calendar to see your own and to add, edit and answer events here."
            : "These are sample events. Set GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET in the hub's .env to connect Google Calendar."}
        </p>
      )}

      <nav aria-label="Weeks" className="flex flex-wrap items-center gap-2">
        <button type="button" onClick={() => go(null)} disabled={thisWeek} className={`${NAV_BTN} disabled:opacity-50`}>
          Today
        </button>
        <button type="button" aria-label="Previous week" onClick={() => go(addDays(data.start, -7))} className={NAV_BTN}>
          ‹
        </button>
        <button type="button" aria-label="Next week" onClick={() => go(addDays(data.start, 7))} className={NAV_BTN}>
          ›
        </button>
        <h2 className="text-lg font-semibold" aria-live="polite">
          {rangeLabel(data.start)}
        </h2>
      </nav>

      {/* Desktop and tablets: the week grid. Phones: one day after another. */}
      <div className="hidden md:block">
        <WeekGrid
          data={data}
          onSelectEvent={open}
          onSelectSlot={data.connected ? (date, time) => setEditor({ kind: "new", date, time }) : undefined}
        />
      </div>
      <div className="flex flex-col gap-5 md:hidden">
        {data.days.map((d) => (
          <section key={d.date} aria-labelledby={`day-${d.date}`} className="flex flex-col gap-1">
            <h3 id={`day-${d.date}`} className="label-caps">
              {d.date === data.today ? `Today · ${longDate(d.date)}` : longDate(d.date)}
            </h3>
            {d.events.length === 0 ? (
              <p className="py-1.5 text-[13px] text-muted">Nothing planned.</p>
            ) : (
              <div className="flex flex-col rounded-xl border border-line bg-surface px-4 py-1">
                {d.events.map((e) => (
                  <Item
                    key={e.id}
                    item={eventItem(e, data.timeZone)}
                    variant="row"
                    timeLabel={e.allDay ? "all day" : clock(data.timeZone, e.start)}
                    aside={
                      e.editable && data.connected ? (
                        <button type="button" onClick={() => open(e)} aria-label={`Edit ${e.title}`} className="min-h-11 rounded-lg border border-line px-3 text-[13px] text-fg hover:bg-raised">
                          Edit
                        </button>
                      ) : undefined
                    }
                  />
                ))}
              </div>
            )}
          </section>
        ))}
      </div>

      {editor && (
        <EventEditor
          target={editor}
          data={data}
          onClose={(changed) => {
            setEditor(null);
            if (params.has("new")) router.replace(week ? `/calendar?week=${week}` : "/calendar", { scroll: false });
            if (changed) void reload();
          }}
        />
      )}
    </div>
  );
}

export default function CalendarPage() {
  return (
    <Suspense>
      <Calendar />
    </Suspense>
  );
}
