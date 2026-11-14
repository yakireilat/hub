import type { Item } from "./item";

export interface CalendarEvent {
  /** `<calendar id>|<event id>`, unique across calendars. */
  id: string;
  title: string;
  /** Epoch ms. All-day events start at 00:00 in the calendar's time zone. */
  start: number;
  end: number;
  allDay: boolean;
  calendar: string;
  location?: string;
  /** Your answer when you're invited; null when it's your own event. */
  response: "needsAction" | "accepted" | "declined" | "tentative" | null;
  /** True when you may change or delete it: your calendar, and you organise it (or it has no guests). */
  editable: boolean;
  href: string;
}

export interface CalendarDay {
  /** YYYY-MM-DD in the calendar's time zone. */
  date: string;
  events: CalendarEvent[];
}

export interface CalendarPayload {
  connected: boolean;
  /** True while Google isn't set up (no client id) or connected: the screen shows sample data. */
  sample: boolean;
  /** Whether the hub has Google OAuth credentials at all. */
  configured: boolean;
  timeZone: string;
  /** First day shown (a Sunday), YYYY-MM-DD. */
  start: string;
  /** Today in the calendar's time zone, YYYY-MM-DD. */
  today: string;
  days: CalendarDay[];
  /** Calendars you can add events to. */
  calendars: { id: string; name: string; primary: boolean }[];
  error?: string;
}

export interface NewEventInput {
  title: string;
  /** YYYY-MM-DD */
  date: string;
  /** HH:MM; absent for an all-day event. */
  time?: string;
  durationMin?: number;
  calendarId?: string;
}

/** How far `tz` is ahead of UTC at instant `t`, in ms. */
function tzOffset(tz: string, t: number): number {
  const p = Object.fromEntries(
    new Intl.DateTimeFormat("en-US", {
      timeZone: tz,
      hourCycle: "h23",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    })
      .formatToParts(t)
      .map((x) => [x.type, x.value]),
  );
  return Date.UTC(+p.year!, +p.month! - 1, +p.day!, +p.hour!, +p.minute!, +p.second!) - Math.floor(t / 1000) * 1000;
}

/** YYYY-MM-DD of instant `t` in `tz`. */
export function dayIn(tz: string, t: number): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit" }).format(t);
}

/** The Sunday on or before `date` (YYYY-MM-DD); weeks run Sunday to Saturday. */
export function weekStart(date: string): string {
  const d = new Date(`${date}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() - d.getUTCDay());
  return d.toISOString().slice(0, 10);
}

/** Epoch ms of 00:00 on `date` (YYYY-MM-DD) in `tz`. */
export function midnight(tz: string, date: string): number {
  const [y, m, d] = date.split("-").map(Number);
  const guess = Date.UTC(y!, m! - 1, d!);
  return guess - tzOffset(tz, guess - tzOffset(tz, guess));
}


/**
 * A sample week (Sunday to Saturday) from the sample calendar items, for when Google isn't connected.
 * Sample events can't be edited.
 */
export function sampleWeek(items: Item[], opts: { timeZone: string; start?: string; now: number; configured: boolean }): CalendarPayload {
  const { timeZone, now } = opts;
  const today = dayIn(timeZone, now);
  const first = weekStart(opts.start ?? today);
  const events = items
    .filter((it) => it.source === "calendar")
    .map((it) => ({
      id: it.id.replace(/^calendar:/, ""),
      title: it.title,
      start: Date.parse(it.time),
      end: Date.parse(it.time) + 3_600_000,
      allDay: false,
      calendar: "sample",
      response: it.kind === "invite" ? ("needsAction" as const) : null,
      editable: false,
      href: it.href,
    }))
    .sort((a, b) => a.start - b.start);
  const days = Array.from({ length: 7 }, (_, i) => {
    const date = dayIn(timeZone, midnight(timeZone, first) + i * 86_400_000 + 12 * 3_600_000);
    return { date, events: events.filter((e) => dayIn(timeZone, e.start) === date) };
  });
  return {
    connected: false,
    sample: true,
    configured: opts.configured,
    timeZone,
    start: first,
    today,
    days,
    calendars: [{ id: "sample", name: "Sample", primary: true }],
  };
}
