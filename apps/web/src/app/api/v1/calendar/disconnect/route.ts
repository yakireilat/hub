import { calendarDisconnect } from "@/lib/hub";

/** Forgets the Google token. Revoking the hub's access in your Google account is separate. */
export async function POST() {
  return Response.json(calendarDisconnect());
}
