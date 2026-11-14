import { dayIn, midnight, weekStart, type ActResult, type Adapter, type CalendarDay, type CalendarEvent, type CalendarPayload, type Command, type Item, type NewEventInput } from "@hub/core";

const AUTH = "https://accounts.google.com/o/oauth2/v2/auth";
const TOKEN = "https://oauth2.googleapis.com/token";
const API = "https://www.googleapis.com/calendar/v3";
/** Events: read, create, answer invites. Calendar list: which calendars exist (read only). */
export const SCOPES = [
  "https://www.googleapis.com/auth/calendar.events",
  "https://www.googleapis.com/auth/calendar.calendarlist.readonly",
];
const DAY = 86_400_000;
const CACHE_MS = 2 * 60_000;

/** Where the refresh token lives (the hub's database). */
export interface TokenStore {
  get(): string | null;
  set(value: string | null): void;
}

interface GCalendar {
  id: string;
  summary: string;
  primary?: boolean;
  selected?: boolean;
  timeZone?: string;
  accessRole?: string;
}

interface GEvent {
  id: string;
  status?: string;
  summary?: string;
  location?: string;
  htmlLink?: string;
  start: { dateTime?: string; date?: string };
  end: { dateTime?: string; date?: string };
  attendees?: { email: string; self?: boolean; responseStatus?: string }[];
  organizer?: { email?: string; self?: boolean };
}

export { dayIn, midnight, weekStart };

/** Google Calendar through its REST API, with one Google account connected by OAuth. */
export function createGoogleCalendar(opts: {
  clientId: string;
  clientSecret: string;
  redirectUri: string;
  tokens: TokenStore;
  fetchFn?: typeof fetch;
  now?: () => number;
}) {
  const fetchFn = opts.fetchFn ?? fetch;
  const now = opts.now ?? Date.now;
  let access: { token: string; until: number } | undefined;
  // One cached snapshot per week start ("" = the rolling window from today).
  const cache = new Map<string, { at: number; value: Promise<Snapshot> }>();

  interface Snapshot {
    timeZone: string;
    calendars: GCalendar[];
    events: CalendarEvent[];
  }

  async function tokenRequest(body: Record<string, string>) {
    const res = await fetchFn(TOKEN, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ client_id: opts.clientId, client_secret: opts.clientSecret, ...body }),
      signal: AbortSignal.timeout(10_000),
    });
    const json = (await res.json().catch(() => ({}))) as { access_token?: string; expires_in?: number; refresh_token?: string; error?: string };
    if (!res.ok || !json.access_token) {
      if (json.error === "invalid_grant") {
        // The connection was revoked or expired: forget it so the screen offers Connect again.
        opts.tokens.set(null);
        throw new Error("Google access was revoked or expired. Connect again.");
      }
      throw new Error(`Google sign-in failed${json.error ? `: ${json.error}` : ""}`);
    }
    access = { token: json.access_token, until: now() + (json.expires_in ?? 3600) * 1000 };
    return json;
  }

  async function bearer(): Promise<string> {
    if (access && access.until > now() + 60_000) return access.token;
    const refresh = opts.tokens.get();
    if (!refresh) throw new Error("Google Calendar isn't connected");
    await tokenRequest({ grant_type: "refresh_token", refresh_token: refresh });
    return access!.token;
  }

  async function api<T>(path: string, init: RequestInit = {}): Promise<T> {
    // DELETE answers 204 with no body.
    const res = await fetchFn(`${API}${path}`, {
      ...init,
      headers: { authorization: `Bearer ${await bearer()}`, "content-type": "application/json", ...(init.headers as Record<string, string>) },
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) throw new Error(`Google Calendar answered HTTP ${res.status}`);
    if (res.status === 204) return undefined as T;
    return (await res.json()) as T;
  }

  function toEvent(calId: string, tz: string, e: GEvent, writable: boolean): CalendarEvent {
    const allDay = !e.start.dateTime;
    const start = allDay ? midnight(tz, e.start.date!) : Date.parse(e.start.dateTime!);
    const end = allDay ? midnight(tz, e.end.date!) : Date.parse(e.end.dateTime ?? e.start.dateTime!);
    const self = e.attendees?.find((a) => a.self);
    return {
      id: `${calId}|${e.id}`,
      title: e.summary ?? "(no title)",
      start,
      end,
      allDay,
      calendar: calId,
      ...(e.location ? { location: e.location } : {}),
      response: (self?.responseStatus as CalendarEvent["response"]) ?? null,
      // Yours to change: on a calendar you can write to, and you organise it (or it has no guests).
      editable: writable && (!e.attendees?.length || e.organizer?.self === true),
      href: e.htmlLink ?? "https://calendar.google.com",
    };
  }

  /**
   * Visible calendars and their events for 8 days from `start` (YYYY-MM-DD; default today) in the
   * primary calendar's time zone. Cached 2 minutes per start date.
   */
  function snapshot(start = ""): Promise<Snapshot> {
    const hit = cache.get(start);
    if (hit && now() - hit.at < CACHE_MS) return hit.value;
    const value = (async () => {
      const { items } = await api<{ items: GCalendar[] }>("/users/me/calendarList?minAccessRole=reader");
      const calendars = items.filter((c) => c.selected || c.primary);
      const timeZone = calendars.find((c) => c.primary)?.timeZone ?? "UTC";
      const from = midnight(timeZone, start || dayIn(timeZone, now()));
      const to = from + 8 * DAY;
      const lists = await Promise.all(
        calendars.map((c) =>
          api<{ items: GEvent[] }>(
            `/calendars/${encodeURIComponent(c.id)}/events?singleEvents=true&orderBy=startTime&maxResults=250&timeMin=${new Date(from).toISOString()}&timeMax=${new Date(to).toISOString()}`,
          ).then((r) =>
            r.items
              .filter((e) => e.status !== "cancelled")
              .map((e) => toEvent(c.id, timeZone, e, c.accessRole === "owner" || c.accessRole === "writer")),
          ),
        ),
      );
      const events = lists.flat().sort((a, b) => a.start - b.start);
      return { timeZone, calendars, events };
    })();
    cache.set(start, { at: now(), value });
    value.catch(() => cache.delete(start));
    return value;
  }
  const invalidate = () => cache.clear();

  const hhmmIn = (tz: string, t: number) =>
    new Intl.DateTimeFormat("en-GB", { timeZone: tz, hour: "2-digit", minute: "2-digit" }).format(t);

  async function read(): Promise<Item[]> {
    if (!opts.tokens.get()) return [];
    const { timeZone, events } = await snapshot();
    const today = dayIn(timeZone, now());
    const items: Item[] = [];
    for (const e of events) {
      const invite = e.response === "needsAction";
      const isToday = dayIn(timeZone, e.start) === today || (e.allDay && e.start <= now() && e.end > now());
      // Today's events go on the agenda; unanswered invites for the coming week need you.
      if (!isToday && !invite) continue;
      if (e.response === "declined") continue;
      const mins = Math.round((e.end - e.start) / 60_000);
      const when = e.allDay ? "All day" : `${isToday ? "Today" : new Intl.DateTimeFormat("en-GB", { timeZone, weekday: "short", day: "numeric", month: "short" }).format(e.start)} ${hhmmIn(timeZone, e.start)}${mins ? ` · ${mins >= 60 ? `${Math.round(mins / 6) / 10} h` : `${mins} min`}` : ""}`;
      items.push({
        id: `calendar:${e.id}`,
        source: "calendar",
        kind: invite ? "invite" : "event",
        title: e.title,
        context: [when, e.location].filter(Boolean).join(" · "),
        time: new Date(e.start).toISOString(),
        status: "info",
        ...(invite ? { statusLabel: "Invite" } : {}),
        route: invite ? "needs_action" : "fyi",
        actions: invite
          ? [
              { id: "accept", label: "Accept", primary: true },
              { id: "decline", label: "Decline" },
            ]
          : [],
        href: e.href,
      });
    }
    return items;
  }

  async function act(itemId: string, actionId: string): Promise<ActResult> {
    if (actionId !== "accept" && actionId !== "decline") return { ok: false, message: "Unknown action" };
    const [calId, eventId] = itemId.replace(/^calendar:/, "").split("|");
    if (!calId || !eventId) return { ok: false, message: "Unknown event" };
    try {
      const path = `/calendars/${encodeURIComponent(calId)}/events/${encodeURIComponent(eventId)}`;
      const ev = await api<GEvent>(path);
      const attendees = (ev.attendees ?? []).map((a) => (a.self ? { ...a, responseStatus: actionId === "accept" ? "accepted" : "declined" } : a));
      await api(`${path}?sendUpdates=all`, { method: "PATCH", body: JSON.stringify({ attendees }) });
      invalidate();
      return { ok: true, message: actionId === "accept" ? "Invite accepted" : "Invite declined" };
    } catch (e) {
      return { ok: false, message: e instanceof Error ? e.message : "Google didn't take the answer" };
    }
  }

  /** The week (Sunday to Saturday) containing `start`, default this week. */
  async function week(start?: string): Promise<CalendarPayload> {
    const tz = (await snapshot()).timeZone;
    const first = weekStart(start ?? dayIn(tz, now()));
    const { timeZone, calendars, events } = await snapshot(first);
    const days: CalendarDay[] = Array.from({ length: 7 }, (_, i) => {
      const date = dayIn(timeZone, midnight(timeZone, first) + i * DAY + 12 * 3_600_000);
      return { date, events: events.filter((e) => dayIn(timeZone, e.start) === date && e.response !== "declined") };
    });
    return {
      connected: true,
      sample: false,
      configured: true,
      timeZone,
      start: first,
      today: dayIn(timeZone, now()),
      days,
      calendars: calendars
        .filter((c) => c.accessRole === "owner" || c.accessRole === "writer")
        .map((c) => ({ id: c.id, name: c.summary, primary: !!c.primary })),
    };
  }

  /** Google's start/end for a form's date, time and duration; a message when the input is wrong. */
  function times(timeZone: string, input: NewEventInput): { start: object; end: object } | string {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(input.date)) return "Pick a date";
    if (!input.time) {
      const next = dayIn(timeZone, midnight(timeZone, input.date) + 36 * 3_600_000);
      return { start: { date: input.date }, end: { date: next } };
    }
    if (!/^\d{2}:\d{2}$/.test(input.time)) return "Use a time like 14:30";
    const [h, m] = input.time.split(":").map(Number);
    const s = midnight(timeZone, input.date) + (h! * 60 + m!) * 60_000;
    const e = s + Math.max(5, input.durationMin ?? 60) * 60_000;
    return { start: { dateTime: new Date(s).toISOString(), timeZone }, end: { dateTime: new Date(e).toISOString(), timeZone } };
  }

  async function createEvent(input: NewEventInput): Promise<ActResult> {
    const title = input.title?.trim();
    if (!title) return { ok: false, message: "Give the event a title" };
    try {
      const { timeZone, calendars } = await snapshot();
      const t = times(timeZone, input);
      if (typeof t === "string") return { ok: false, message: t };
      const calId = input.calendarId ?? calendars.find((c) => c.primary)?.id ?? "primary";
      await api(`/calendars/${encodeURIComponent(calId)}/events`, { method: "POST", body: JSON.stringify({ summary: title, ...t }) });
      invalidate();
      return { ok: true, message: `Added “${title}”` };
    } catch (e) {
      return { ok: false, message: e instanceof Error ? e.message : "Google didn't add the event" };
    }
  }

  const eventPath = (id: string) => {
    const [calId, eventId] = id.split("|");
    return calId && eventId ? `/calendars/${encodeURIComponent(calId)}/events/${encodeURIComponent(eventId)}` : null;
  };

  /** Changes title and time; guests are told (sendUpdates=all). */
  async function updateEvent(id: string, input: NewEventInput): Promise<ActResult> {
    const title = input.title?.trim();
    const path = eventPath(id);
    if (!path) return { ok: false, message: "Unknown event" };
    if (!title) return { ok: false, message: "Give the event a title" };
    try {
      const t = times((await snapshot()).timeZone, input);
      if (typeof t === "string") return { ok: false, message: t };
      await api(`${path}?sendUpdates=all`, { method: "PATCH", body: JSON.stringify({ summary: title, ...t }) });
      invalidate();
      return { ok: true, message: `Saved “${title}”` };
    } catch (e) {
      return { ok: false, message: e instanceof Error ? e.message : "Google didn't save the change" };
    }
  }

  async function deleteEvent(id: string): Promise<ActResult> {
    const path = eventPath(id);
    if (!path) return { ok: false, message: "Unknown event" };
    try {
      await api(`${path}?sendUpdates=all`, { method: "DELETE" });
      invalidate();
      return { ok: true, message: "Event deleted" };
    } catch (e) {
      return { ok: false, message: e instanceof Error ? e.message : "Google didn't delete the event" };
    }
  }

  const adapter: Adapter = {
    id: "calendar",
    name: "Google Calendar",
    read,
    act,
    link: (item) => item.href,
    commands: (): Command[] => [
      { id: "calendar:new", label: "New event", keywords: ["create", "meeting", "calendar"], scope: "calendar", href: "/calendar?new=1" },
    ],
  };

  return {
    adapter,
    connected: () => !!opts.tokens.get(),
    /** Google's consent page; `state` comes back to the callback to prove the round trip is ours. */
    authUrl: (state: string) =>
      `${AUTH}?${new URLSearchParams({
        client_id: opts.clientId,
        redirect_uri: opts.redirectUri,
        response_type: "code",
        scope: SCOPES.join(" "),
        access_type: "offline",
        prompt: "consent",
        include_granted_scopes: "true",
        state,
      })}`,
    /** Trades the callback's code for tokens and keeps the refresh token. */
    async connect(code: string) {
      const json = await tokenRequest({ grant_type: "authorization_code", code, redirect_uri: opts.redirectUri });
      if (!json.refresh_token) throw new Error("Google didn't return a refresh token. Remove the hub's access in your Google account, then connect again.");
      opts.tokens.set(json.refresh_token);
      invalidate();
    },
    disconnect() {
      opts.tokens.set(null);
      access = undefined;
      invalidate();
    },
    week,
    createEvent,
    updateEvent,
    deleteEvent,
  };
}

export type GoogleCalendar = ReturnType<typeof createGoogleCalendar>;
