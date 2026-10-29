import { getHub } from "@/lib/hub";

export const dynamic = "force-dynamic";

/** Deploy health check (phase 2) — 200 when the app can assemble Today. */
export async function GET() {
  const today = await getHub().today();
  return Response.json({ ok: true, needs: today.needs.length });
}
