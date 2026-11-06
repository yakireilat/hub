import { restoreService } from "@/lib/hub";

export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const result = restoreService((await params).id);
  return Response.json(result, { status: result.ok ? 200 : 404 });
}
