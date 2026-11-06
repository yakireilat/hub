"use client";

import type { ServiceInput } from "@hub/core";
import { useId, useState, useTransition } from "react";
import type { SaveResult } from "@/lib/client";

const FIELD = "min-h-11 w-full rounded-lg border border-line bg-ground px-3 text-fg outline-none focus-visible:border-accent";

export function ServiceForm({
  initial,
  nodes,
  submitLabel,
  onSubmit,
  onCancel,
  notes = [],
}: {
  initial: ServiceInput;
  nodes: string[];
  submitLabel: string;
  onSubmit: (input: ServiceInput) => Promise<SaveResult>;
  onCancel: () => void;
  /** Lines from smart add: what it recognised and what to double-check. */
  notes?: { tone: "info" | "warn"; text: string }[];
}) {
  const [v, setV] = useState({ ...initial, health: initial.health ?? "", slow_ms: initial.slow_ms ?? 1500 });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [pending, start] = useTransition();
  const id = useId();
  const set = (k: keyof typeof v) => (e: React.ChangeEvent<HTMLInputElement>) => setV({ ...v, [k]: e.target.value });

  const field = (k: keyof typeof v, label: string, props: React.InputHTMLAttributes<HTMLInputElement> = {}, hint?: string) => (
    <label className="flex flex-col gap-1.5 text-[13px] text-fg-soft" htmlFor={`${id}-${k}`}>
      {label}
      <input id={`${id}-${k}`} name={k} value={String(v[k] ?? "")} onChange={set(k)} className={FIELD} aria-invalid={!!errors[k]} {...props} />
      {errors[k] ? <span className="text-st-failed">■ {errors[k]}</span> : hint && <span className="text-muted">{hint}</span>}
    </label>
  );

  return (
    <form
      aria-label={submitLabel}
      className="flex flex-col gap-3 rounded-xl border border-accent bg-surface p-4"
      onKeyDown={(e) => e.key === "Escape" && onCancel()}
      onSubmit={(e) => {
        e.preventDefault();
        start(async () => {
          const r = await onSubmit({ ...v, slow_ms: Number(v.slow_ms) });
          setErrors(r.ok ? {} : (r.errors ?? { form: r.message }));
        });
      }}
    >
      {notes.length > 0 && (
        <ul className="flex flex-col gap-1 text-[13px]">
          {notes.map((n) => (
            <li key={n.text} className={n.tone === "warn" ? "text-st-slow" : "text-muted"}>
              {n.tone === "warn" ? "▲ " : "◆ "}
              {n.text}
            </li>
          ))}
        </ul>
      )}
      <div className="grid gap-3 md:grid-cols-2">
        {field("name", "Name", { required: true, autoFocus: true })}
        {field("url", "Address", { required: true, type: "url", inputMode: "url" }, "Where a click goes.")}
        {field("health", "Health check (optional)", { type: "url", inputMode: "url" }, "What the hub checks. Leave empty to check the address.")}
        <div className="grid grid-cols-2 gap-3">
          {field("node", "Node", { list: `${id}-nodes`, required: true })}
          {field("slow_ms", "Slow after (ms)", { type: "number", min: 100, max: 30000, step: 100 })}
        </div>
      </div>
      <datalist id={`${id}-nodes`}>
        {nodes.map((n) => (
          <option key={n} value={n} />
        ))}
      </datalist>
      {errors.form && <p className="text-[13px] text-st-failed">■ {errors.form}</p>}
      <div className="flex gap-2">
        <button type="submit" disabled={pending} className="min-h-11 rounded-lg bg-accent px-4 font-semibold text-on-accent disabled:opacity-60">
          {pending ? "Checking…" : submitLabel}
        </button>
        <button type="button" onClick={onCancel} className="min-h-11 rounded-lg border border-line px-4 text-fg hover:bg-raised">
          Cancel
        </button>
      </div>
    </form>
  );
}
