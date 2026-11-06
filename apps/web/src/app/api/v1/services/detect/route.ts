import { suggestService } from "@/lib/hub";

// Behind Authelia like the rest of the hub; it only probes the address it was given, with a timeout.
export async function POST(req: Request) {
  const { input } = (await req.json().catch(() => ({}))) as { input?: unknown };
  if (typeof input !== "string" || !input.trim()) {
    return Response.json({ ok: false, message: "Type a name or an address" }, { status: 422 });
  }
  try {
    return Response.json(await suggestService(input));
  } catch {
    return Response.json({ ok: false, message: `“${input}” isn't an address the hub can use` }, { status: 422 });
  }
}
