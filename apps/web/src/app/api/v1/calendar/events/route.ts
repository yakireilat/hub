import type { NewEventInput } from "@hub/core";
import { createCalendarEvent } from "@/lib/hub";

/** New event: {title, date: "YYYY-MM-DD", time?: "HH:MM", durationMin?, calendarId?}; no time = all day. */
export async function POST(req: Request) {
  const input = (await req.json().catch(() => ({}))) as NewEventInput;
  const result = await createCalendarEvent(input);
  return Response.json(result, { status: result.ok ? 201 : 422 });
}
