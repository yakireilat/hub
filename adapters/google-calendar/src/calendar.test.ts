import { describe, expect, it } from "vitest";
import { createGoogleCalendar, dayIn, midnight, weekStart } from "./index";

const TZ = "Asia/Jerusalem";
// Sat 14 Nov 2026, 10:00 in Jerusalem (UTC+2 in winter).
const NOW = Date.UTC(2026, 10, 14, 8, 0);

describe("time zones", () => {
  it("finds midnight and the date in the calendar's zone", () => {
    expect(new Date(midnight(TZ, "2026-11-14")).toISOString()).toBe("2026-11-13T22:00:00.000Z");
    expect(new Date(midnight(TZ, "2026-07-01")).toISOString()).toBe("2026-06-30T21:00:00.000Z"); // summer, UTC+3
    expect(dayIn(TZ, Date.UTC(2026, 10, 13, 23, 30))).toBe("2026-11-14");
  });
  it("weeks start on Sunday", () => {
    expect(weekStart("2026-11-14")).toBe("2026-11-08"); // Saturday → the Sunday before
    expect(weekStart("2026-11-15")).toBe("2026-11-15"); // Sunday stays
    expect(weekStart("2026-11-01")).toBe("2026-11-01");
  });
});

function fakeGoogle() {
  const calls: { method: string; url: string; body?: string }[] = [];
  let refreshes = 0;
  const events = [
    { id: "e1", summary: "Standup", start: { dateTime: "2026-11-14T09:30:00+02:00" }, end: { dateTime: "2026-11-14T09:45:00+02:00" }, htmlLink: "https://cal/e1", organizer: { self: true } },
    {
      id: "e2", summary: "Dentist", start: { dateTime: "2026-11-16T16:00:00+02:00" }, end: { dateTime: "2026-11-16T16:45:00+02:00" },
      attendees: [{ email: "me@x", self: true, responseStatus: "needsAction" }, { email: "clinic@x", responseStatus: "accepted" }],
    },
    { id: "e3", summary: "Trip", start: { date: "2026-11-17" }, end: { date: "2026-11-19" } },
    { id: "e4", summary: "Gone", status: "cancelled", start: { dateTime: "2026-11-14T12:00:00+02:00" }, end: { dateTime: "2026-11-14T13:00:00+02:00" } },
  ];
  const fetchFn: typeof fetch = async (input, init) => {
    const url = String(input);
    const method = init?.method ?? "GET";
    calls.push({ method, url, body: typeof init?.body === "string" ? init.body : init?.body?.toString() });
    if (url.includes("oauth2.googleapis.com/token")) {
      refreshes++;
      return Response.json({ access_token: "at", expires_in: 3600 });
    }
    if (url.includes("/calendarList")) {
      return Response.json({ items: [{ id: "me@x", summary: "Me", primary: true, selected: true, timeZone: TZ, accessRole: "owner" }, { id: "hidden", summary: "Hidden", selected: false }] });
    }
    if (url.includes("/events/e2") && method === "GET") return Response.json(events[1]);
    if (method === "DELETE") return new Response(null, { status: 204 });
    if (url.includes("/events?")) return Response.json({ items: events });
    return Response.json({});
  };
  return { calls, fetchFn, refreshes: () => refreshes };
}

const make = (f: ReturnType<typeof fakeGoogle>, token: string | null = "rt") => {
  let stored = token;
  return createGoogleCalendar({
    clientId: "cid", clientSecret: "secret", redirectUri: "https://hub.mesh.net/api/v1/calendar/callback",
    tokens: { get: () => stored, set: (v) => void (stored = v) }, fetchFn: f.fetchFn, now: () => NOW,
  });
};

describe("google calendar", () => {
  it("puts today's events on the agenda and unanswered invites in Needs action", async () => {
    const f = fakeGoogle();
    const items = await make(f).adapter.read();
    expect(items.map((i) => [i.title, i.kind, i.route])).toEqual([
      ["Standup", "event", "fyi"],
      ["Dentist", "invite", "needs_action"],
    ]);
    expect(items[0]?.context).toBe("Today 09:30 · 15 min");
    expect(items[1]?.actions.map((a) => a.id)).toEqual(["accept", "decline"]);
    expect(f.calls.filter((c) => c.url.includes("/events?"))).toHaveLength(1); // hidden calendar not read
    expect(f.refreshes()).toBe(1);
  });

  it("answers an invite by patching only your own attendee entry", async () => {
    const f = fakeGoogle();
    const cal = make(f);
    expect(await cal.adapter.act("calendar:me@x|e2", "accept")).toEqual({ ok: true, message: "Invite accepted" });
    const patch = f.calls.find((c) => c.method === "PATCH")!;
    expect(patch.url).toContain("/events/e2?sendUpdates=all");
    expect(JSON.parse(patch.body!).attendees).toEqual([
      { email: "me@x", self: true, responseStatus: "accepted" },
      { email: "clinic@x", responseStatus: "accepted" },
    ]);
  });

  it("shows Sunday-to-Saturday weeks and creates timed and all-day events in the calendar's zone", async () => {
    const f = fakeGoogle();
    const cal = make(f);
    const week = await cal.week("2026-11-17");
    expect(week).toMatchObject({ start: "2026-11-15", today: "2026-11-14" });
    expect(week.days.map((d) => [d.date, d.events.map((e) => e.title)])).toEqual([
      ["2026-11-15", []], ["2026-11-16", ["Dentist"]], ["2026-11-17", ["Trip"]], ["2026-11-18", []],
      ["2026-11-19", []], ["2026-11-20", []], ["2026-11-21", []],
    ]);
    expect(week.calendars).toEqual([{ id: "me@x", name: "Me", primary: true }]);
    expect((await cal.week()).start).toBe("2026-11-08");
    expect(f.calls.some((c) => c.url.includes("timeMin=2026-11-14T22:00:00.000Z"))).toBe(true); // 15 Nov 00:00 in Jerusalem

    expect(await cal.createEvent({ title: "Lunch", date: "2026-11-15", time: "13:00", durationMin: 60 })).toMatchObject({ ok: true });
    expect(JSON.parse(f.calls.at(-1)!.body!)).toEqual({
      summary: "Lunch",
      start: { dateTime: "2026-11-15T11:00:00.000Z", timeZone: TZ },
      end: { dateTime: "2026-11-15T12:00:00.000Z", timeZone: TZ },
    });
    await cal.createEvent({ title: "Holiday", date: "2026-11-20" });
    expect(JSON.parse(f.calls.at(-1)!.body!)).toEqual({ summary: "Holiday", start: { date: "2026-11-20" }, end: { date: "2026-11-21" } });
    expect(await cal.createEvent({ title: " ", date: "2026-11-20" })).toMatchObject({ ok: false });
  });

  it("reads nothing until connected, and builds a consent URL for offline access", async () => {
    const f = fakeGoogle();
    const cal = make(f, null);
    expect(await cal.adapter.read()).toEqual([]);
    const url = new URL(cal.authUrl("abc"));
    expect(url.searchParams.get("access_type")).toBe("offline");
    expect(url.searchParams.get("state")).toBe("abc");
    expect(url.searchParams.get("redirect_uri")).toBe("https://hub.mesh.net/api/v1/calendar/callback");
  });

  it("lets you edit and delete your own events, and only those", async () => {
    const f = fakeGoogle();
    const cal = make(f);
    const days = (await cal.week("2026-11-08")).days.concat((await cal.week("2026-11-15")).days);
    const byTitle = Object.fromEntries(days.flatMap((d) => d.events).map((e) => [e.title, e]));
    expect(byTitle.Standup?.editable).toBe(true); // you organise it
    expect(byTitle.Dentist?.editable).toBe(false); // someone else's invite
    expect(byTitle.Trip?.editable).toBe(true); // no guests

    expect(await cal.updateEvent("me@x|e1", { title: "Standup (short)", date: "2026-11-14", time: "10:00", durationMin: 10 })).toMatchObject({ ok: true });
    const patch = f.calls.find((c) => c.method === "PATCH")!;
    expect(patch.url).toContain("/calendars/me%40x/events/e1?sendUpdates=all");
    expect(JSON.parse(patch.body!)).toEqual({
      summary: "Standup (short)",
      start: { dateTime: "2026-11-14T08:00:00.000Z", timeZone: TZ },
      end: { dateTime: "2026-11-14T08:10:00.000Z", timeZone: TZ },
    });
    expect(await cal.deleteEvent("me@x|e1")).toEqual({ ok: true, message: "Event deleted" });
    expect(f.calls.at(-1)).toMatchObject({ method: "DELETE" });
    expect(await cal.updateEvent("nonsense", { title: "x", date: "2026-11-14" })).toMatchObject({ ok: false });
  });
});
