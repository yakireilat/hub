import type { Scope } from "./adapter";

export const PREFIXES: Record<string, Scope> = { ">": "action", "#": "note", "@": "calendar", "/": "service" };

export interface ParsedQuery {
  scope: Scope | "all";
  text: string;
}

/** `> retry` → actions, `#backup` → notes and docs, `@` → calendar, `/` → services. */
export function parseQuery(raw: string): ParsedQuery {
  const trimmed = raw.trimStart();
  const scope = PREFIXES[trimmed.charAt(0)];
  return scope ? { scope, text: trimmed.slice(1).trim() } : { scope: "all", text: raw.trim() };
}
