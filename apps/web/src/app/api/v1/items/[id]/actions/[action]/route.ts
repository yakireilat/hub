import { getHub } from "@/lib/hub";

// No auth yet: phase 2 puts Authelia in front, phase 7 adds scoped tokens for system users.
export async function POST(_req: Request, { params }: { params: Promise<{ id: string; action: string }> }) {
  const { id, action } = await params;
  const result = await getHub().act(id, action);
  return Response.json(result, { status: result.ok ? 200 : 422 });
}
