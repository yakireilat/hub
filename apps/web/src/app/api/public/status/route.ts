import { publicStatusPayload } from "@/lib/hub";

export const dynamic = "force-dynamic";

/**
 * {"up":N,"total":M,"nominal":bool} for the landing page at home.mesh.net, the same shape
 * mesh-dashboard served. nginx exposes only this path without Authelia.
 */
export async function GET() {
  return Response.json(await publicStatusPayload(), { headers: { "cache-control": "no-store" } });
}
