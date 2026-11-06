import { addService, servicesPayload } from "@/lib/hub";

export const dynamic = "force-dynamic";

export async function GET() {
  return Response.json(await servicesPayload());
}

export async function POST(req: Request) {
  const result = await addService(await req.json().catch(() => ({})));
  return Response.json(result, { status: result.ok ? 201 : 422 });
}
