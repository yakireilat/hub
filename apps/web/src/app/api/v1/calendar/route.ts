import { calendarPayload } from "@/lib/hub";

export const dynamic = "force-dynamic";

/** The week containing ?start=YYYY-MM-DD (default this week), Sunday to Saturday. */
export async function GET(req: Request) {
  const start = new URL(req.url).searchParams.get("start");
  return Response.json(await calendarPayload(start && /^\d{4}-\d{2}-\d{2}$/.test(start) ? start : undefined));
}
