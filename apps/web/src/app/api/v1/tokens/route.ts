import { createToken, guarded, tokensPayload } from "@/lib/api";

export const dynamic = "force-dynamic";

/** People only (tokens get 403): the tokens, never their secrets, and the latest audit entries. */
export const GET = guarded(async () => Response.json(tokensPayload()));

/** {name, scopes: [...], expiresInDays: number | null}. The answer holds the token, once. */
export const POST = guarded(async (req: Request) => {
  const result = createToken(await req.json().catch(() => ({})));
  return Response.json(result, { status: result.ok ? 201 : 422, headers: { "cache-control": "no-store" } });
});
