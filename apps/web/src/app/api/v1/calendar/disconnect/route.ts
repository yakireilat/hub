import { guarded } from "@/lib/api";
import { calendarDisconnect } from "@/lib/hub";

/** Forgets the Google token. Revoking the hub's access in your Google account is separate. */
export const POST = guarded(async () => {
  return Response.json(calendarDisconnect());
});
