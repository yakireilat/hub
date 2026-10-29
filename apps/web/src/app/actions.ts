"use server";

import type { ActResult } from "@hub/core";
import { revalidatePath } from "next/cache";
import { getHub } from "@/lib/hub";

export async function runAction(itemId: string, actionId: string): Promise<ActResult> {
  const result = await getHub().act(itemId, actionId);
  revalidatePath("/", "layout");
  return result;
}

export async function capture(text: string): Promise<ActResult> {
  const t = text.trim();
  if (!t) return { ok: false, message: "Nothing to capture" };
  // Phase 6 appends this to Inbox.md through the vault adapter.
  return { ok: true, message: `Captured “${t.length > 40 ? t.slice(0, 40) + "…" : t}”` };
}
