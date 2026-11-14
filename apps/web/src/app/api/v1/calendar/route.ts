import { calendarPayload } from "@/lib/hub";

export const dynamic = "force-dynamic";

export async function GET() {
  return Response.json(await calendarPayload());
}
