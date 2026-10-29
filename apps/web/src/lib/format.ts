const clock = new Intl.DateTimeFormat("en-GB", { hour: "2-digit", minute: "2-digit" });
const day = new Intl.DateTimeFormat("en-GB", { weekday: "long", day: "numeric", month: "long" });

/** Formats in the viewer's time zone; data renders only in the browser, so there is no hydration mismatch. */
export const hhmm = (iso: string | Date) => clock.format(new Date(iso));
export const longDay = (d: Date) => day.format(d);
