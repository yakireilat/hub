import { guarded, revokeToken } from "@/lib/api";

/** Revoke a token. It stays listed, marked revoked, so the audit log still names it. */
export const DELETE = guarded(async (_req: Request, { params }: { params: Promise<{ id: string }> }) => {
  const result = revokeToken((await params).id);
  return Response.json(result, { status: result.ok ? 200 : 404 });
});
