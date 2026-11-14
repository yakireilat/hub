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
