import { openApi } from "@hub/core";
import { guarded } from "@/lib/api";
import { apiConfig } from "@/lib/hub";

export const dynamic = "force-dynamic";

/** The API description. Any valid token may read it, whatever its scopes. */
export const GET = guarded(async () => Response.json(openApi(apiConfig().public_url)));
