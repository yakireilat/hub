"use client";

import type { CalendarEvent, CalendarPayload, Item as ItemModel, NewEventInput } from "@hub/core";
import { useEffect, useId, useRef, useState, useTransition } from "react";
import { Item } from "@/components/item/Item";
import { useHub } from "@/components/shell/HubProvider";
import { useToast } from "@/components/shell/Toast";
import { clock, dateOf, durationText, longDate } from "./time";

const FIELD = "min-h-11 w-full rounded-lg border border-line bg-ground px-3 text-fg outline-none focus-visible:border-accent";
const DURATIONS = [15, 30, 45, 60, 90, 120, 180, 240];

/** What the dialog shows: a new event (optionally at a slot), or an existing one. */
export type EditorTarget = { kind: "new"; date?: string; time?: string } | { kind: "event"; event: CalendarEvent };

export function eventItem(e: CalendarEvent, tz: string): ItemModel {
  const invite = e.response === "needsAction";
  const mins = Math.round((e.end - e.start) / 60_000);
  return {
    id: `calendar:${e.id}`,
    source: "calendar",
    kind: invite ? "invite" : "event",
    title: e.title,
    context: [e.allDay ? "All day" : `${clock(tz, e.start)}–${clock(tz, e.end)} · ${durationText(mins)}`, e.location].filter(Boolean).join(" · "),
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

export function EventEditor({
  target,
  data,
  onClose,
}: {
  target: EditorTarget;
  data: CalendarPayload;
  /** `changed` = something was saved, so the week should reload. */
  onClose: (changed: boolean) => void;
}) {
  const { client, refresh } = useHub();
  const toast = useToast();
  const id = useId();
  const dialog = useRef<HTMLDivElement>(null);
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const tz = data.timeZone;
  const existing = target.kind === "event" ? target.event : null;
  const editable = target.kind === "new" ? data.connected : !!existing?.editable && data.connected;
  const [allDay, setAllDay] = useState(existing?.allDay ?? false);

  // Escape closes. Focus moves into the dialog once, when it opens, never again while typing.
  const closeRef = useRef(onClose);
  closeRef.current = onClose;
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && closeRef.current(false);
    window.addEventListener("keydown", onKey);
    dialog.current?.querySelector<HTMLElement>("input, button, a")?.focus();
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const mins = existing ? Math.round((existing.end - existing.start) / 60_000) : 60;
  const initial = {
    title: existing?.title ?? "",
    date: existing ? dateOf(tz, existing.start) : (target.kind === "new" && target.date) || data.today,
    time: existing && !existing.allDay ? clock(tz, existing.start) : (target.kind === "new" && target.time) || "09:00",
    duration: String(existing && !existing.allDay ? mins : 60),
  };
  const durations = DURATIONS.includes(Number(initial.duration)) ? DURATIONS : [...DURATIONS, Number(initial.duration)].sort((a, b) => a - b);

  const done = (r: { ok: boolean; message: string }) => {
    if (!r.ok) return setError(r.message);
    toast(r);
    void refresh();
    onClose(true);
  };

  const heading = target.kind === "new" ? "New event" : editable ? "Edit event" : existing!.title;

  return (
    <div className="fixed inset-0 z-40 flex items-end justify-center bg-black/60 p-3 sm:items-center" onClick={() => onClose(false)}>
      <div
        ref={dialog}
        role="dialog"
        aria-modal="true"
        aria-labelledby={`${id}-heading`}
        onClick={(e) => e.stopPropagation()}
        className="flex max-h-[90vh] w-full max-w-lg flex-col gap-4 overflow-y-auto rounded-2xl border border-line bg-surface p-5 shadow-2xl"
      >
        <h2 id={`${id}-heading`} className="text-lg font-semibold">
          {heading}
        </h2>

        {!editable && existing ? (
          <>
            <Item item={eventItem(existing, tz)} />
            <p className="text-[13px] text-muted">
              {longDate(dateOf(tz, existing.start))}.{" "}
              {!data.connected
                ? "Sample event: connect Google Calendar to edit your own events."
                : existing.response === "needsAction"
                  ? "Someone else organises this event: answer the invite here, or change it in Google Calendar."
                  : "Only the organiser can change this event."}
            </p>
            <div className="flex flex-wrap gap-2">
              <a href={existing.href} target="_blank" rel="noreferrer" className="inline-flex min-h-11 items-center rounded-lg border border-line px-4 text-fg hover:bg-raised">
                Open in Google Calendar
              </a>
              <button type="button" onClick={() => onClose(false)} className="min-h-11 rounded-lg border border-line px-4 text-fg hover:bg-raised">
                Close
              </button>
            </div>
          </>
        ) : (
          <form
            aria-label={heading}
            className="flex flex-col gap-3"
            onSubmit={(e) => {
              e.preventDefault();
              const f = new FormData(e.currentTarget);
              const input: NewEventInput = {
                title: String(f.get("title") ?? ""),
                date: String(f.get("date") ?? ""),
                ...(allDay ? {} : { time: String(f.get("time") ?? ""), durationMin: Number(f.get("duration")) }),
                ...(f.get("calendar") ? { calendarId: String(f.get("calendar")) } : {}),
              };
              start(async () => done(existing ? await client.updateEvent(existing.id, input) : await client.createEvent(input)));
            }}
          >
            <label className="flex flex-col gap-1.5 text-[13px] text-fg-soft" htmlFor={`${id}-title`}>
              Title
              <input id={`${id}-title`} name="title" required defaultValue={initial.title} className={FIELD} />
            </label>
            <div className="grid grid-cols-2 gap-3">
              <label className="col-span-2 flex flex-col gap-1.5 text-[13px] text-fg-soft sm:col-span-1" htmlFor={`${id}-date`}>
                Date
                <input id={`${id}-date`} name="date" type="date" required defaultValue={initial.date} className={FIELD} />
              </label>
              <label className="flex flex-col gap-1.5 text-[13px] text-fg-soft" htmlFor={`${id}-time`}>
                Time
                <input id={`${id}-time`} name="time" type="time" required={!allDay} disabled={allDay} defaultValue={initial.time} className={FIELD} />
              </label>
              <label className="flex flex-col gap-1.5 text-[13px] text-fg-soft" htmlFor={`${id}-duration`}>
                Duration
                <select id={`${id}-duration`} name="duration" disabled={allDay} defaultValue={initial.duration} className={FIELD}>
                  {durations.map((m) => (
                    <option key={m} value={m}>
                      {durationText(m)}
                    </option>
                  ))}
                </select>
              </label>
              <label className="flex min-h-11 items-center gap-2 self-end text-sm text-fg-soft">
                <input type="checkbox" checked={allDay} onChange={(e) => setAllDay(e.target.checked)} className="size-4 accent-[var(--hub-accent)]" />
                All day
              </label>
            </div>
            {!existing && data.calendars.length > 1 && (
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
            {error && <p className="text-[13px] text-st-failed">■ {error}</p>}
            <div className="flex flex-wrap gap-2">
              <button type="submit" disabled={pending} className="min-h-11 rounded-lg bg-accent px-4 font-semibold text-on-accent disabled:opacity-60">
                {pending ? "Saving…" : existing ? "Save" : "Add event"}
              </button>
              <button type="button" onClick={() => onClose(false)} className="min-h-11 rounded-lg border border-line px-4 text-fg hover:bg-raised">
                Cancel
              </button>
              {existing && (
                <button
                  type="button"
                  disabled={pending}
                  onClick={() => (confirmDelete ? start(async () => done(await client.deleteEvent(existing.id))) : setConfirmDelete(true))}
                  className="ml-auto min-h-11 rounded-lg border border-line px-4 text-st-failed hover:bg-raised disabled:opacity-60"
                >
                  {confirmDelete ? "Confirm delete" : "Delete"}
                </button>
              )}
            </div>
            {existing && <p className="text-[12px] text-muted">Guests, if any, are told about changes.</p>}
          </form>
        )}
      </div>
    </div>
  );
}
