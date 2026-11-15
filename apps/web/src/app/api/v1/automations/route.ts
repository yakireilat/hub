import { guarded } from "@/lib/api";
import { automationsPayload } from "@/lib/hub";

export const dynamic = "force-dynamic";

export const GET = guarded(async () => {
  return Response.json(await automationsPayload());
});
