const clock = new Intl.DateTimeFormat("en-GB", { hour: "2-digit", minute: "2-digit" });
const day = new Intl.DateTimeFormat("en-GB", { weekday: "long", day: "numeric", month: "long" });

/** Formats in the viewer's time zone; data renders only in the browser, so there is no hydration mismatch. */
export const hhmm = (iso: string | Date) => clock.format(new Date(iso));
export const longDay = (d: Date) => day.format(d);

/** "<1 min", "12 min", "5 h", "3 d": how long ago `from` was. */
export function duration(from: number, now = Date.now()): string {
  const min = Math.floor((now - from) / 60_000);
  if (min < 1) return "<1 min";
  if (min < 60) return `${min} min`;
  const h = Math.floor(min / 60);
  if (h < 48) return `${h} h`;
  return `${Math.floor(h / 24)} d`;
}
