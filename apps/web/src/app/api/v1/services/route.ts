import { guarded } from "@/lib/api";
import { addService, servicesPayload } from "@/lib/hub";

export const dynamic = "force-dynamic";

export const GET = guarded(async () => {
  return Response.json(await servicesPayload());
});

export const POST = guarded(async (req: Request) => {
  const result = await addService(await req.json().catch(() => ({})));
  return Response.json(result, { status: result.ok ? 201 : 422 });
});
