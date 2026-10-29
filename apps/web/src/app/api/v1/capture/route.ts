import { captureResult } from "@/lib/capture";

export async function POST(req: Request) {
  const body = (await req.json().catch(() => ({}))) as { text?: unknown };
  const result = captureResult(typeof body.text === "string" ? body.text : "");
  return Response.json(result, { status: result.ok ? 200 : 422 });
}
