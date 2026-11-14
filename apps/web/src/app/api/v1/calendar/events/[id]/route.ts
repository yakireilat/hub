import type { NewEventInput } from "@hub/core";
import { deleteCalendarEvent, updateCalendarEvent } from "@/lib/hub";

type Ctx = { params: Promise<{ id: string }> };

/** Change an event: {title, date, time?, durationMin?}; no time = all day. Guests are told. */
export async function PATCH(req: Request, { params }: Ctx) {
  const input = (await req.json().catch(() => ({}))) as NewEventInput;
  const result = await updateCalendarEvent((await params).id, input);
  return Response.json(result, { status: result.ok ? 200 : 422 });
}

export async function DELETE(_req: Request, { params }: Ctx) {
  const result = await deleteCalendarEvent((await params).id);
  return Response.json(result, { status: result.ok ? 200 : 422 });
}
