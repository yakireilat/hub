import { getHub } from "@/lib/hub";

export const dynamic = "force-dynamic";

/**
 * Liveness for Docker, deploy.sh and Playwright: 200 once the hub, its config and its database are up.
 * It never runs service checks, so it stays fast and can itself be monitored as a service.
 */
export async function GET() {
  getHub();
  return Response.json({ ok: true });
}
