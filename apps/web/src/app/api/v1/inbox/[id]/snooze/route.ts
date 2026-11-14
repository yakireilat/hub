import { snoozeItem, unsnoozeItem } from "@/lib/hub";

type Ctx = { params: Promise<{ id: string }> };

/** Snooze an Inbox item: body {"until": epoch ms}. */
export async function POST(req: Request, { params }: Ctx) {
  const { until } = (await req.json().catch(() => ({}))) as { until?: unknown };
  const result = await snoozeItem((await params).id, Number(until));
  return Response.json(result, { status: result.ok ? 200 : 422 });
}

/** Unsnooze: the item goes back to where its rule puts it. */
export async function DELETE(_req: Request, { params }: Ctx) {
  return Response.json(await unsnoozeItem((await params).id));
}
