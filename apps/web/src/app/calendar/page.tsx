"use client";

import type { CalendarEvent, CalendarPayload, Item as ItemModel } from "@hub/core";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useCallback, useEffect, useId, useState, useTransition } from "react";
import { Item } from "@/components/item/Item";
import { useHub } from "@/components/shell/HubProvider";
import { useToast } from "@/components/shell/Toast";

const FIELD = "min-h-11 w-full rounded-lg border border-line bg-ground px-3 text-fg outline-none focus-visible:border-accent";

function clock(tz: string, t: number) {
  return new Intl.DateTimeFormat("en-GB", { timeZone: tz, hour: "2-digit", minute: "2-digit" }).format(t);
}

function dayHeading(date: string, index: number) {
  const d = new Date(`${date}T12:00:00Z`);
  const name = new Intl.DateTimeFormat("en-GB", { weekday: "long", day: "numeric", month: "long", timeZone: "UTC" }).format(d);
  return index === 0 ? `Today · ${name}` : index === 1 ? `Tomorrow · ${name}` : name;
}

function toItem(e: CalendarEvent, tz: string): ItemModel {
  const invite = e.response === "needsAction";
  const mins = Math.round((e.end - e.start) / 60_000);
  return {
    id: `calendar:${e.id}`,
    source: "calendar",
    kind: invite ? "invite" : "event",
    title: e.title,
    context: [e.allDay ? "All day" : `${clock(tz, e.start)}–${clock(tz, e.end)}${mins ? ` · ${mins >= 60 ? `${Math.round(mins / 6) / 10} h` : `${mins} min`}` : ""}`, e.location]
      .filter(Boolean)
      .join(" · "),
    time: new Date(e.start).toISOString(),
    status: "info",
    statusLabel: invite ? "Invite" : e.response === "tentative" ? "Maybe" : "Event",
    route: invite ? "needs_action" : "fyi",
    actions: invite
      ? [
          { id: "accept", label: "Accept", primary: true },
          { id: "decline", label: "Decline" },
        ]
      : [],
    href: e.href,
  };
}

function NewEvent({ data, onDone }: { data: CalendarPayload; onDone: () => void }) {
  const { client, refresh } = useHub();
  const toast = useToast();
  const id = useId();
  const [pending, start] = useTransition();
  const [allDay, setAllDay] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const today = data.days[0]?.date ?? new Date().toISOString().slice(0, 10);

  return (
    <form
      aria-label="New event"
      className="flex flex-col gap-3 rounded-xl border border-accent bg-surface p-4"
      onKeyDown={(e) => e.key === "Escape" && onDone()}
      onSubmit={(e) => {
        e.preventDefault();
        const f = new FormData(e.currentTarget);
        start(async () => {
          const r = await client.createEvent({
            title: String(f.get("title") ?? ""),
            date: String(f.get("date") ?? ""),
            ...(allDay ? {} : { time: String(f.get("time") ?? ""), durationMin: Number(f.get("duration")) }),
            calendarId: String(f.get("calendar") ?? "") || undefined,
          });
          if (r.ok) {
            toast(r);
            onDone();
            void refresh();
          } else setError(r.message);
        });
      }}
    >
      <div className="grid gap-3 md:grid-cols-2">
        <label className="flex flex-col gap-1.5 text-[13px] text-fg-soft md:col-span-2" htmlFor={`${id}-title`}>
          Title
          <input id={`${id}-title`} name="title" required autoFocus className={FIELD} />
        </label>
        <label className="flex flex-col gap-1.5 text-[13px] text-fg-soft" htmlFor={`${id}-date`}>
          Date
          <input id={`${id}-date`} name="date" type="date" required defaultValue={today} className={FIELD} />
        </label>
        <div className="grid grid-cols-2 gap-3">
          <label className="flex flex-col gap-1.5 text-[13px] text-fg-soft" htmlFor={`${id}-time`}>
            Time
            <input id={`${id}-time`} name="time" type="time" required={!allDay} disabled={allDay} defaultValue="09:00" className={FIELD} />
          </label>
          <label className="flex flex-col gap-1.5 text-[13px] text-fg-soft" htmlFor={`${id}-duration`}>
            Duration
            <select id={`${id}-duration`} name="duration" disabled={allDay} defaultValue="60" className={FIELD}>
              {[15, 30, 45, 60, 90, 120, 180].map((m) => (
                <option key={m} value={m}>
                  {m < 60 ? `${m} min` : `${m / 60} h`}
                </option>
              ))}
            </select>
          </label>
        </div>
        <label className="flex min-h-11 items-center gap-2 text-sm text-fg-soft">
          <input type="checkbox" checked={allDay} onChange={(e) => setAllDay(e.target.checked)} className="size-4 accent-[var(--hub-accent)]" />
          All day
        </label>
        {data.calendars.length > 1 && (
          <label className="flex flex-col gap-1.5 text-[13px] text-fg-soft" htmlFor={`${id}-calendar`}>
            Calendar
            <select id={`${id}-calendar`} name="calendar" defaultValue={data.calendars.find((c) => c.primary)?.id} className={FIELD}>
              {data.calendars.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </label>
        )}
      </div>
      {error && <p className="text-[13px] text-st-failed">■ {error}</p>}
      <div className="flex gap-2">
        <button type="submit" disabled={pending} className="min-h-11 rounded-lg bg-accent px-4 font-semibold text-on-accent disabled:opacity-60">
          {pending ? "Adding…" : "Add event"}
        </button>
        <button type="button" onClick={onDone} className="min-h-11 rounded-lg border border-line px-4 text-fg hover:bg-raised">
          Cancel
        </button>
      </div>
    </form>
  );
}

function Calendar() {
  const { client, refresh, today } = useHub();
  const toast = useToast();
  const params = useSearchParams();
  const router = useRouter();
  const [data, setData] = useState<CalendarPayload | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [, start] = useTransition();
  const adding = params.has("new");

  const reload = useCallback(async () => {
    try {
      setData(await client.calendar());
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }, [client]);
  // Reload on a timer and whenever Today changes (an invite answered there shows here too).
  useEffect(() => {
    void reload();
    const t = window.setInterval(() => void reload(), 120_000);
    return () => window.clearInterval(t);
  }, [reload, today]);

  const setAdding = (on: boolean) => {
    router.replace(on ? "/calendar?new=1" : "/calendar", { scroll: false });
    if (!on) void reload();
  };

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

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-baseline gap-x-3.5 gap-y-2">
        <h1 className="text-[30px] font-semibold tracking-tight">Calendar</h1>
        <p className="text-muted">
          {data.connected ? <span className="text-st-up">● Google Calendar</span> : <span className="text-st-idle">◌ Not connected</span>}
          {invites > 0 && <span className="text-st-info"> · ◆ {invites} to answer</span>}
        </p>
        <div className="ml-auto flex flex-wrap gap-2">
          {data.connected && !adding && (
            <button type="button" onClick={() => setAdding(true)} className="min-h-11 rounded-[10px] bg-accent px-3.5 font-semibold text-on-accent">
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
              className="min-h-11 rounded-[10px] border border-line px-3.5 text-fg hover:bg-raised"
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
            ? "These are sample events. Connect Google Calendar to see your own and to add events and answer invites here."
            : "These are sample events. Set GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET in the hub's .env to connect Google Calendar."}
        </p>
      )}

      {adding && data.connected && <NewEvent data={data} onDone={() => setAdding(false)} />}

      {data.days.map((d, i) => (
        <section key={d.date} aria-labelledby={`day-${d.date}`} className="flex flex-col gap-1">
          <h2 id={`day-${d.date}`} className="label-caps">
            {dayHeading(d.date, i)}
          </h2>
          {d.events.length === 0 ? (
            <p className="py-1.5 text-[13px] text-muted">Nothing planned.</p>
          ) : (
            <div className="flex flex-col rounded-xl border border-line bg-surface px-4 py-1">
              {d.events.map((e) => (
                <Item
                  key={e.id}
                  item={toItem(e, data.timeZone)}
                  variant="row"
                  timeLabel={e.allDay ? "all day" : clock(data.timeZone, e.start)}
                />
              ))}
            </div>
          )}
        </section>
      ))}
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
