import { guarded } from "@/lib/api";
import { randomBytes } from "node:crypto";
import { calendarConnectUrl, PUBLIC_URL } from "@/lib/hub";

export const dynamic = "force-dynamic";

/** Sends the browser to Google's consent page, remembering a one-time state in a cookie. */
export const GET = guarded(async () => {
  const nonce = randomBytes(24).toString("hex");
  const url = calendarConnectUrl(nonce);
  if (!url) return Response.redirect(`${PUBLIC_URL}/calendar?error=not-configured`, 303);
  return new Response(null, {
    status: 303,
    headers: {
      location: url,
      "set-cookie": `hub_oauth_state=${nonce}; Path=/api/v1/calendar; HttpOnly; Secure; SameSite=Lax; Max-Age=600`,
    },
  });
});
