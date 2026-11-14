"use client";

import type { ServicesPayload, ServiceSuggestion } from "@hub/core";
import { useState, useTransition } from "react";
import { useHub } from "@/components/shell/HubProvider";
import { useToast } from "@/components/shell/Toast";
import { ServiceForm } from "./ServiceForm";

/** Smart add: type a name or address, check what the hub found, then save. */
export function AddService({
  nodes,
  removed = [],
  onAdded,
}: {
  nodes: string[];
  /** Services removed earlier, offered back with one click. */
  removed?: ServicesPayload["removed"];
  onAdded: () => void;
}) {
  const { client, refresh } = useHub();
  const toast = useToast();
  const [input, setInput] = useState("");
  const [suggestion, setSuggestion] = useState<ServiceSuggestion | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const reset = () => {
    setSuggestion(null);
    setInput("");
    setError(null);
  };

  if (suggestion) {
    const notes = [
      ...(suggestion.known ? [{ tone: "info" as const, text: `Recognised ${suggestion.known}, so its health endpoint is filled in.` }] : []),
      ...(suggestion.duplicateOf ? [{ tone: "warn" as const, text: `${suggestion.duplicateOf} already has this name or address.` }] : []),
      ...suggestion.notes.map((text) => ({ tone: suggestion.reachable === false ? ("warn" as const) : ("info" as const), text })),
    ];
    return (
      <ServiceForm
        initial={suggestion}
        nodes={nodes}
        notes={notes}
        submitLabel="Add service"
        onCancel={reset}
        onSubmit={async (svc) => {
          const r = await client.addService(svc);
          if (r.ok) {
            toast(r);
            reset();
            onAdded();
            void refresh();
          }
          return r;
        }}
      />
    );
  }

  return (
    <form
      className="flex flex-col gap-2"
      onSubmit={(e) => {
        e.preventDefault();
        if (!input.trim()) return;
        start(async () => {
          try {
            setSuggestion(await client.detectService(input));
            setError(null);
          } catch (err) {
            setError(err instanceof Error ? err.message : String(err));
          }
        });
      }}
    >
      <label htmlFor="add-service" className="label-caps">
        Add a service
      </label>
      <div className="flex flex-wrap gap-2">
        <input
          id="add-service"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="A name or address: jellyfin, git.mesh.net, http://100.100.101.100:8989"
          autoComplete="off"
          className="min-h-11 min-w-0 flex-[1_1_320px] rounded-lg border border-line bg-surface px-3 text-fg outline-none placeholder:text-muted focus-visible:border-accent"
        />
        <button type="submit" disabled={pending || !input.trim()} className="min-h-11 rounded-lg bg-accent px-4 font-semibold text-on-accent disabled:opacity-60">
          {pending ? "Looking…" : "Find it"}
        </button>
      </div>
      {error ? (
        <p className="text-[13px] text-st-failed">■ {error}</p>
      ) : (
        <p className="text-[13px] text-muted">The hub works out the app, its health check and the node. You confirm before anything is saved.</p>
      )}
      {removed.length > 0 && (
        <div className="mt-2 flex flex-col gap-1.5">
          <span className="text-[13px] text-muted">Removed earlier: not checked or counted until restored.</span>
          <ul className="flex flex-wrap gap-2" aria-label="Removed services">
            {removed.map((r) => (
              <li key={r.id}>
                <button
                  type="button"
                  disabled={pending}
                  onClick={() =>
                    start(async () => {
                      toast(await client.restoreService(r.id));
                      onAdded();
                      void refresh();
                    })
                  }
                  aria-label={`Restore ${r.name}`}
                  className="flex min-h-11 items-center gap-2 rounded-lg border border-line px-3 text-[13px] text-fg hover:bg-raised disabled:opacity-60"
                >
                  <span aria-hidden="true">↺</span>
                  {r.name}
                  <span className="text-muted">· {r.node}</span>
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </form>
  );
}
