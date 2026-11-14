import { setWorkflowActive } from "@/lib/hub";

/** Switch a workflow on or off: body {"active": true | false}. */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { active } = (await req.json().catch(() => ({}))) as { active?: unknown };
  if (typeof active !== "boolean") return Response.json({ ok: false, message: "Send {\"active\": true or false}" }, { status: 422 });
  const result = await setWorkflowActive((await params).id, active);
  return Response.json(result, { status: result.ok ? 200 : 502 });
}
