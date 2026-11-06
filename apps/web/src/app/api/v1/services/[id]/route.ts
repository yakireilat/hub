import { removeService, updateService } from "@/lib/hub";

type Ctx = { params: Promise<{ id: string }> };

export async function PATCH(req: Request, { params }: Ctx) {
  const result = await updateService((await params).id, await req.json().catch(() => ({})));
  return Response.json(result, { status: result.ok ? 200 : 422 });
}

export async function DELETE(_req: Request, { params }: Ctx) {
  const result = removeService((await params).id);
  return Response.json(result, { status: result.ok ? 200 : 404 });
}
