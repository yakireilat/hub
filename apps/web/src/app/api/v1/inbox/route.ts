import { guarded } from "@/lib/api";
import { inboxPayload } from "@/lib/hub";

export const dynamic = "force-dynamic";

export const GET = guarded(async () => {
  return Response.json(await inboxPayload());
});
