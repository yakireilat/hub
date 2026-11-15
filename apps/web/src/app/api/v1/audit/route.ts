import { guarded, tokensPayload } from "@/lib/api";

export const dynamic = "force-dynamic";

/** Every call made with a token, newest first (the last 200). People only. */
export const GET = guarded(async () => Response.json(tokensPayload().audit));
