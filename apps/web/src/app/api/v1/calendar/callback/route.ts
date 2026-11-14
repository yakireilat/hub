import { calendarCallback, PUBLIC_URL } from "@/lib/hub";

export const dynamic = "force-dynamic";

const back = (query: string) =>
  new Response(null, {
    status: 303,
    headers: {
      location: `${PUBLIC_URL}/calendar?${query}`,
      "set-cookie": "hub_oauth_state=; Path=/api/v1/calendar; HttpOnly; Secure; SameSite=Lax; Max-Age=0",
    },
  });

/** Google sends the browser back here with a code; the state must match the cookie set by /connect. */
export async function GET(req: Request) {
  const url = new URL(req.url);
  if (url.searchParams.get("error")) return back(`error=${encodeURIComponent(url.searchParams.get("error")!)}`);
  const cookie = /(?:^|;\s*)hub_oauth_state=([^;]+)/.exec(req.headers.get("cookie") ?? "")?.[1];
  const state = url.searchParams.get("state");
  const code = url.searchParams.get("code");
  if (!cookie || !state || cookie !== state || !code) return back("error=state-mismatch");
  try {
    await calendarCallback(code);
    return back("connected=1");
  } catch (e) {
    return back(`error=${encodeURIComponent(e instanceof Error ? e.message : "connect-failed")}`);
  }
}
