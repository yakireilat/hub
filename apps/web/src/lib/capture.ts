import type { ActResult } from "@hub/core";

/** Phase 6 appends captures to Inbox.md through the vault adapter; until then this only confirms. */
export function captureResult(text: string): ActResult {
  const t = text.trim();
  if (!t) return { ok: false, message: "Nothing to capture" };
  return { ok: true, message: `Captured “${t.length > 40 ? t.slice(0, 40) + "…" : t}”` };
}
