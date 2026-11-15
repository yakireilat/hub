import { guarded } from "@/lib/api";
import { getHub } from "@/lib/hub";

export const POST = guarded(async (_req: Request, { params }: { params: Promise<{ id: string; action: string }> }) => {
  const { id, action } = await params;
  const result = await getHub().act(id, action);
  return Response.json(result, { status: result.ok ? 200 : 422 });
});
