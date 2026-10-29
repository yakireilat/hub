const clock = new Intl.DateTimeFormat("en-GB", {
  hour: "2-digit",
  minute: "2-digit",
  timeZone: process.env.HUB_TZ || undefined,
});

const day = new Intl.DateTimeFormat("en-GB", {
  weekday: "long",
  day: "numeric",
  month: "long",
  timeZone: process.env.HUB_TZ || undefined,
});

/** Server-side only: formats in HUB_TZ so server and browser never disagree. */
export const hhmm = (iso: string | Date) => clock.format(new Date(iso));
export const longDay = (d: Date) => day.format(d);
