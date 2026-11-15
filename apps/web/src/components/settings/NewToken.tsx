"use client";

import { API_SCOPES, type ApiScope } from "@hub/core";
import { useId, useState, useTransition } from "react";
import { useHub } from "@/components/shell/HubProvider";

const FIELD = "min-h-11 w-full rounded-lg border border-line bg-ground px-3 text-fg outline-none focus-visible:border-accent";
const EXPIRY = [
  { value: "30", label: "30 days" },
  { value: "90", label: "90 days" },
  { value: "365", label: "1 year" },
  { value: "never", label: "Never" },
];

/** Name, scopes, expiry. On success the token is shown once, with Copy. */
export function NewToken({ onDone }: { onDone: (created: boolean) => void }) {
  const { client } = useHub();
  const id = useId();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [token, setToken] = useState<{ name: string; value: string } | null>(null);
  const [copied, setCopied] = useState(false);

  if (token) {
    return (
      <section aria-labelledby={`${id}-made`} className="flex flex-col gap-3 rounded-xl border border-st-up/40 bg-surface p-4">
        <h3 id={`${id}-made`} className="font-semibold">
          <span className="text-st-up">● Created</span> {token.name}
        </h3>
        <p className="text-[13px] text-muted">Copy it now. The hub keeps only a hash, so it can&apos;t show this again.</p>
        <code data-testid="new-token" className="break-all rounded-lg border border-line bg-ground p-3 font-mono text-[13px]">
          {token.value}
        </code>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => {
              void navigator.clipboard?.writeText(token.value).then(() => setCopied(true));
            }}
            className="min-h-11 rounded-lg bg-accent px-4 font-semibold text-on-accent"
          >
            {copied ? "Copied" : "Copy token"}
          </button>
          <button type="button" onClick={() => onDone(true)} className="min-h-11 rounded-lg border border-line px-4 text-fg hover:bg-raised">
            Done
          </button>
        </div>
      </section>
    );
  }

  return (
    <form
      aria-label="New token"
      className="flex flex-col gap-4 rounded-xl border border-line bg-surface p-4"
      onSubmit={(e) => {
        e.preventDefault();
        const f = new FormData(e.currentTarget);
        const name = String(f.get("name") ?? "");
        const expiry = String(f.get("expiry"));
        start(async () => {
          const r = await client.createToken({
            name,
            scopes: f.getAll("scope").map(String) as ApiScope[],
            expiresInDays: expiry === "never" ? null : Number(expiry),
          });
          if (!r.ok || !r.token) return setError(r.message);
          setError(null);
          setToken({ name: name.trim(), value: r.token });
        });
      }}
    >
      <div className="grid gap-3 sm:grid-cols-[1fr_180px]">
        <label className="flex flex-col gap-1.5 text-[13px] text-fg-soft" htmlFor={`${id}-name`}>
          Name: who will use it
          <input id={`${id}-name`} name="name" required maxLength={60} placeholder="Home Assistant" autoFocus className={FIELD} />
        </label>
        <label className="flex flex-col gap-1.5 text-[13px] text-fg-soft" htmlFor={`${id}-expiry`}>
          Expires after
          <select id={`${id}-expiry`} name="expiry" defaultValue="90" className={FIELD}>
            {EXPIRY.map((x) => (
              <option key={x.value} value={x.value}>
                {x.label}
              </option>
            ))}
          </select>
        </label>
      </div>
      <fieldset className="flex flex-col gap-1">
        <legend className="pb-1 text-[13px] text-fg-soft">Scopes: what it may do</legend>
        <div className="grid gap-x-4 sm:grid-cols-2">
          {(Object.entries(API_SCOPES) as [ApiScope, string][]).map(([scope, what]) => (
            <label key={scope} className="flex min-h-11 items-center gap-2.5 text-sm">
              <input type="checkbox" name="scope" value={scope} className="size-4 flex-none accent-[var(--hub-accent)]" />
              <span className="flex flex-col">
                <span className="font-mono text-[13px]">{scope}</span>
                <span className="text-[12px] text-muted">{what}</span>
              </span>
            </label>
          ))}
        </div>
      </fieldset>
      {error && <p className="text-[13px] text-st-failed">■ {error}</p>}
      <div className="flex flex-wrap gap-2">
        <button type="submit" disabled={pending} className="min-h-11 rounded-lg bg-accent px-4 font-semibold text-on-accent disabled:opacity-60">
          {pending ? "Creating…" : "Create token"}
        </button>
        <button type="button" onClick={() => onDone(false)} className="min-h-11 rounded-lg border border-line px-4 text-fg hover:bg-raised">
          Cancel
        </button>
      </div>
    </form>
  );
}
