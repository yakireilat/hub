"use client";

import { useSearchParams } from "next/navigation";
import { useEffect, useRef, useState, useTransition } from "react";
import { useHub } from "@/components/shell/HubProvider";
import { useToast } from "@/components/shell/Toast";

export function Capture() {
  const [text, setText] = useState("");
  const [pending, start] = useTransition();
  const ref = useRef<HTMLInputElement>(null);
  const toast = useToast();
  const { capture } = useHub();
  const params = useSearchParams();

  useEffect(() => {
    if (params.get("capture")) ref.current?.focus();
  }, [params]);

  return (
    <form
      className="flex flex-col gap-2"
      onSubmit={(e) => {
        e.preventDefault();
        start(async () => {
          const r = await capture(text);
          toast(r);
          if (r.ok) setText("");
        });
      }}
    >
      <label htmlFor="capture" className="label-caps">
        Capture
      </label>
      <div className="flex min-h-12 items-center gap-2 rounded-xl border border-accent bg-surface pl-3.5 pr-1.5">
        <input
          id="capture"
          ref={ref}
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => e.key === "Escape" && e.currentTarget.blur()}
          placeholder="A note, task or link…"
          autoComplete="off"
          className="min-w-0 flex-1 bg-transparent text-fg outline-none placeholder:text-muted"
        />
        <button
          type="submit"
          disabled={pending}
          aria-label="Save capture"
          className="flex size-9 items-center justify-center rounded-[9px] bg-accent text-on-accent disabled:opacity-60"
        >
          <svg aria-hidden="true" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
            <path d="M12 19V5M5 12l7-7 7 7" />
          </svg>
        </button>
      </div>
    </form>
  );
}
