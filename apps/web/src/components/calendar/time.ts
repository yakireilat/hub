/** Date helpers for the Calendar screen. Dates are YYYY-MM-DD strings in the calendar's time zone. */

export function addDays(date: string, n: number): string {
  const d = new Date(`${date}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

/** HH:MM of `t` in `tz`. */
export function clock(tz: string, t: number): string {
  return new Intl.DateTimeFormat("en-GB", { timeZone: tz, hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(t);
}

/** Minutes since local midnight of `t` in `tz`. */
export function minutesOfDay(tz: string, t: number): number {
  const [h, m] = clock(tz, t).split(":").map(Number);
  return h! * 60 + m!;
}

/** YYYY-MM-DD of `t` in `tz`. */
export function dateOf(tz: string, t: number): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: tz }).format(t);
}

const fmt = (date: string, o: Intl.DateTimeFormatOptions) =>
  new Intl.DateTimeFormat("en-GB", { ...o, timeZone: "UTC" }).format(new Date(`${date}T12:00:00Z`));

export const weekdayShort = (date: string) => fmt(date, { weekday: "short" });
export const dayNumber = (date: string) => fmt(date, { day: "numeric" });
export const longDate = (date: string) => fmt(date, { weekday: "long", day: "numeric", month: "long" });

/** "15 – 21 November 2026", or "29 November – 5 December 2026" across months. */
export function rangeLabel(start: string): string {
  const end = addDays(start, 6);
  const sameMonth = start.slice(0, 7) === end.slice(0, 7);
  return sameMonth
    ? `${fmt(start, { day: "numeric" })} – ${fmt(end, { day: "numeric", month: "long", year: "numeric" })}`
    : `${fmt(start, { day: "numeric", month: "long" })} – ${fmt(end, { day: "numeric", month: "long", year: "numeric" })}`;
}

export const durationText = (mins: number) => (mins >= 60 ? `${Math.round(mins / 6) / 10} h` : `${mins} min`);

/**
 * Side-by-side lanes for overlapping events, like Google Calendar: each event gets a lane and the
 * number of lanes in its overlapping group, so widths can be shared.
 */
export function layoutLanes<T extends { start: number; end: number }>(events: T[]): { event: T; lane: number; lanes: number }[] {
  const sorted = [...events].sort((a, b) => a.start - b.start || b.end - a.end);
  const out: { event: T; lane: number; lanes: number }[] = [];
  let group: { event: T; lane: number; lanes: number }[] = [];
  let laneEnds: number[] = [];
  let groupEnd = -Infinity;
  const close = () => {
    for (const g of group) g.lanes = laneEnds.length;
    out.push(...group);
    group = [];
    laneEnds = [];
  };
  for (const e of sorted) {
    if (e.start >= groupEnd && group.length) close();
    let lane = laneEnds.findIndex((end) => end <= e.start);
    if (lane < 0) {
      lane = laneEnds.length;
      laneEnds.push(e.end);
    } else laneEnds[lane] = e.end;
    group.push({ event: e, lane, lanes: 0 });
    groupEnd = Math.max(groupEnd === -Infinity ? e.end : groupEnd, e.end);
  }
  if (group.length) close();
  return out;
}
