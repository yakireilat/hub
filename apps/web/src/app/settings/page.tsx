"use client";

import { ENDPOINTS, type TokensPayload } from "@hub/core";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useCallback, useEffect, useState, useTransition } from "react";
import { Item } from "@/components/item/Item";
import { NewToken } from "@/components/settings/NewToken";
import { auditItem, tokenItem, tokenState } from "@/components/settings/tokens";
import { useHub } from "@/components/shell/HubProvider";
import { useToast } from "@/components/shell/Toast";

const BTN = "min-h-11 rounded-lg border border-line px-3 text-[13px] text-fg hover:bg-raised";
const base = process.env.NEXT_PUBLIC_BASE_PATH ?? "";

function Settings() {
  const { client } = useHub();
  const toast = useToast();
  const params = useSearchParams();
  const router = useRouter();
  const [data, setData] = useState<TokensPayload | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [creating, setCreating] = useState(params.has("new"));
  const [confirm, setConfirm] = useState<string | null>(null);
  const [showRevoked, setShowRevoked] = useState(false);
  const [, start] = useTransition();
  const now = Date.now();

  const reload = useCallback(async () => {
    try {
      setData(await client.tokens());
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }, [client]);
  useEffect(() => {
    void reload();
  }, [reload]);

  if (error && !data) {
    return (
      <p role="alert" className="rounded-xl border border-line bg-surface p-4">
        <span className="text-st-failed">■ Can&apos;t reach the hub.</span> <span className="text-muted">{error}</span>
      </p>
    );
  }
  if (!data) return <div aria-busy="true" aria-label="Loading settings" className="h-64 animate-pulse rounded-xl bg-surface" />;

  const live = data.tokens.filter((t) => tokenState(t, now) === "active");
  const shown = showRevoked ? data.tokens : live;
  const hidden = data.tokens.length - live.length;

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-1">
        <h1 className="text-[30px] font-semibold tracking-tight">Settings</h1>
        <p className="text-muted">API access for system users: scripts, Home Assistant, n8n, agents.</p>
      </div>

      <section aria-labelledby="api-heading" className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center gap-3">
          <h2 id="api-heading" className="text-xl font-semibold">
            API tokens
          </h2>
          <span className="text-[13px] text-muted">
            {live.length ? <span className="text-st-up">● {live.length} active</span> : <span className="text-st-idle">◌ none active</span>}
          </span>
          {!creating && (
            <button type="button" onClick={() => setCreating(true)} className="ml-auto min-h-11 rounded-[10px] bg-accent px-3.5 font-semibold text-on-accent">
              New token
            </button>
          )}
        </div>
        <p className="text-[13px] text-muted">
          Machines call <code className="font-mono text-fg-soft">{data.apiUrl}</code> with{" "}
          <code className="font-mono text-fg-soft">Authorization: Bearer hub_…</code>. Each token can do only what its scopes allow, and every call
          lands in the audit log below. Managing tokens is for people only: a token can&apos;t create or see tokens.
        </p>

        {creating && (
          <NewToken
            onDone={(created) => {
              setCreating(false);
              if (params.has("new")) router.replace("/settings", { scroll: false });
              if (created) void reload();
            }}
          />
        )}

        <div id="tokens" className="flex flex-col rounded-xl border border-line bg-surface px-4 py-1">
          {shown.length === 0 && <p className="py-3 text-[13px] text-muted">No tokens yet. Create one for each system that should reach the hub.</p>}
          {shown.map((t) => (
            <Item
              key={t.id}
              item={tokenItem(t, now)}
              variant="row"
              timeLabel={`id ${t.id}`}
              aside={
                t.revokedAt === null ? (
                  <button
                    type="button"
                    aria-label={confirm === t.id ? `Confirm revoke ${t.name}` : `Revoke ${t.name}`}
                    onClick={() =>
                      confirm === t.id
                        ? start(async () => {
                            toast(await client.revokeToken(t.id));
                            setConfirm(null);
                            void reload();
                          })
                        : setConfirm(t.id)
                    }
                    className={`${BTN} text-st-failed!`}
                  >
                    {confirm === t.id ? "Confirm revoke" : "Revoke"}
                  </button>
                ) : undefined
              }
            />
          ))}
        </div>
        {hidden > 0 && (
          <button type="button" onClick={() => setShowRevoked((v) => !v)} className={`${BTN} self-start`}>
            {showRevoked ? "Hide revoked and expired" : `Show ${hidden} revoked or expired`}
          </button>
        )}
      </section>

      <section aria-labelledby="audit-heading" className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center gap-3">
          <h2 id="audit-heading" className="text-xl font-semibold">
            Audit log
          </h2>
          <span className="text-[13px] text-muted">Every call made with a token, newest first</span>
          <button type="button" onClick={() => void reload()} className={`${BTN} ml-auto`}>
            Refresh
          </button>
        </div>
        <div className="flex flex-col rounded-xl border border-line bg-surface px-4 py-1">
          {data.audit.length === 0 && <p className="py-3 text-[13px] text-muted">No calls yet.</p>}
          {data.audit.map((e, i) => (
            <Item key={`${e.at}-${i}`} item={auditItem(e, i)} variant="row" />
          ))}
        </div>
      </section>

      <section aria-labelledby="endpoints-heading" className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center gap-3">
          <h2 id="endpoints-heading" className="text-xl font-semibold">
            Endpoints
          </h2>
          <a href={`${base}/api/v1/openapi.json`} className="inline-flex min-h-11 items-center text-[13px] text-accent hover:text-accent-soft">
            OpenAPI description →
          </a>
        </div>
        <div className="overflow-x-auto rounded-xl border border-line bg-surface">
          <table className="w-full text-left text-[13px]">
            <thead className="label-caps text-[11px]!">
              <tr className="border-b border-divider">
                <th scope="col" className="px-4 py-2 font-medium">Call</th>
                <th scope="col" className="px-4 py-2 font-medium">What it does</th>
                <th scope="col" className="px-4 py-2 font-medium">Needs</th>
              </tr>
            </thead>
            <tbody>
              {ENDPOINTS.map((e) => (
                <tr key={`${e.method} ${e.path}`} className="border-b border-divider last:border-0">
                  <td className="whitespace-nowrap px-4 py-2 font-mono">
                    <span className="text-muted">{e.method}</span> {e.path.replace("/api/v1", "")}
                  </td>
                  <td className="px-4 py-2 text-fg-soft">{e.summary}</td>
                  <td className="whitespace-nowrap px-4 py-2 font-mono text-muted">{e.access === "person" ? "a person" : e.access === "open" ? "any token" : e.access}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}

export default function SettingsPage() {
  return (
    <Suspense>
      <Settings />
    </Suspense>
  );
}
