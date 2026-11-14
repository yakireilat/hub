"use client";

import type { AutomationsPayload, Item as ItemModel, RunView, WorkflowView } from "@hub/core";
import { useCallback, useEffect, useState, useTransition } from "react";
import { Item, statusText } from "@/components/item/Item";
import { useHub } from "@/components/shell/HubProvider";
import { useToast } from "@/components/shell/Toast";
import { duration } from "@/lib/format";

const RUN: Record<RunView["status"], { shape: string; word: string; tone: string }> = {
  success: { shape: "●", word: "ok", tone: "text-st-up" },
  error: { shape: "■", word: "failed", tone: "text-st-failed" },
  running: { shape: "◆", word: "running", tone: "text-st-info" },
  waiting: { shape: "◆", word: "waiting", tone: "text-st-info" },
  canceled: { shape: "◌", word: "canceled", tone: "text-st-idle" },
};

function toItem(w: WorkflowView): ItemModel {
  const last = w.recent[0];
  const status = !w.active && !last ? "idle" : last?.status === "error" ? "failed" : last ? "up" : "idle";
  return {
    id: `n8n:workflow:${w.id}`,
    source: "n8n",
    kind: "run",
    title: w.name,
    context: `${w.runsToday} ${w.runsToday === 1 ? "run" : "runs"} in 24 h${w.failedToday ? ` · ${w.failedToday} failed` : ""}`,
    time: new Date(last?.startedAt ?? Date.now()).toISOString(),
    status,
    statusLabel: w.active ? (status === "failed" ? "Last run failed" : "On") : "Off",
    route: "fyi",
    actions: [],
    href: w.href,
  };
}

function Workflow({ w, onChanged }: { w: WorkflowView; onChanged: () => void }) {
  const { client, act, refresh } = useHub();
  const toast = useToast();
  const [pending, start] = useTransition();
  const last = w.recent[0];

  const run = (fn: () => Promise<{ ok: boolean; message: string }>) =>
    start(async () => {
      toast(await fn());
      onChanged();
      void refresh();
    });

  return (
    <div className="rounded-lg">
      <Item
        item={toItem(w)}
        variant="row"
        timeLabel={last ? `${duration(last.startedAt)} ago` : "no runs"}
        aside={
          <>
            <ol className="hidden items-center gap-1.5 md:flex" aria-label={`Last runs of ${w.name}`}>
              {w.recent.map((r) => (
                <li key={r.id}>
                  <a href={r.href} target="_blank" rel="noreferrer" title={`Run ${r.id}: ${RUN[r.status].word}, ${duration(r.startedAt)} ago`} className={`text-xs ${RUN[r.status].tone}`}>
                    {RUN[r.status].shape}
                    <span className="sr-only">
                      Run {r.id} {RUN[r.status].word}
                    </span>
                  </a>
                </li>
              ))}
            </ol>
            {last?.status === "error" && (
              <button
                type="button"
                disabled={pending}
                onClick={() => run(() => act(`n8n:exec:${last.id}`, "retry"))}
                className="min-h-11 rounded-lg bg-accent px-3.5 text-[13px] font-semibold text-on-accent disabled:opacity-60"
              >
                Retry
              </button>
            )}
            <button
              type="button"
              aria-pressed={w.active}
              aria-label={`${w.name}: ${w.active ? "switch off" : "switch on"}`}
              disabled={pending}
              onClick={() => run(() => client.setWorkflowActive(w.id, !w.active))}
              className="min-h-11 rounded-lg border border-line px-3 text-[13px] text-fg hover:bg-raised disabled:opacity-60"
            >
              {w.active ? "Switch off" : "Switch on"}
            </button>
            <a href={w.href} target="_blank" rel="noreferrer" className="inline-flex min-h-11 items-center rounded-lg border border-line px-3 text-[13px] text-fg hover:bg-raised">
              Open
            </a>
          </>
        }
      />
    </div>
  );
}

export default function AutomationsPage() {
  const { client } = useHub();
  const [data, setData] = useState<AutomationsPayload | null>(null);
  const [error, setError] = useState<string | null>(null);
  const reload = useCallback(async () => {
    try {
      setData(await client.automations());
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }, [client]);
  useEffect(() => {
    void reload();
    const t = window.setInterval(() => void reload(), 60_000);
    return () => window.clearInterval(t);
  }, [reload]);

  if (error && !data) {
    return (
      <p role="alert" className="rounded-xl border border-line bg-surface p-4">
        <span className="text-st-failed">■ Can&apos;t reach the hub.</span> <span className="text-muted">{error}</span>
      </p>
    );
  }
  if (!data) return <div aria-busy="true" aria-label="Loading automations" className="h-64 animate-pulse rounded-xl bg-surface" />;

  const wf = data.workflows;
  const runs = wf.reduce((n, w) => n + w.runsToday, 0);
  const failing = wf.filter((w) => w.recent[0]?.status === "error").length;
  const on = wf.filter((w) => w.active).length;

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-baseline gap-x-3.5 gap-y-2">
        <h1 className="text-[30px] font-semibold tracking-tight">Automations</h1>
        <p className="text-muted">
          {on} of {wf.length} on · {runs} runs in 24 h
          {failing > 0 && (
            <>
              {" · "}
              <span className={statusText.failed}>■ {failing} failing</span>
            </>
          )}
        </p>
      </div>

      {data.sample && (
        <p className="rounded-xl border border-dashed border-line p-4 text-[13px] text-muted">
          These are sample workflows. Set N8N_API_KEY in the hub&apos;s .env and the hub shows your real n8n workflows and runs.
        </p>
      )}
      {data.error && (
        <p role="alert" className="rounded-xl border border-line bg-surface p-4 text-[13px]">
          <span className="text-st-failed">■ n8n didn&apos;t answer:</span> <span className="text-muted">{data.error}</span>
        </p>
      )}

      {wf.length > 0 && (
        <section aria-label="Workflows" className="flex flex-col rounded-xl border border-line bg-surface px-4 py-2">
          {wf.map((w) => (
            <Workflow key={w.id} w={w} onChanged={() => void reload()} />
          ))}
        </section>
      )}
    </div>
  );
}
