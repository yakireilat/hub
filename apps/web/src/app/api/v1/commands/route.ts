import { getHub } from "@/lib/hub";

export const dynamic = "force-dynamic";

export async function GET() {
  return Response.json(await getHub().commands());
}
