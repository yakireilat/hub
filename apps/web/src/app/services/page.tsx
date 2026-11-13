"use client";

import { STATUSES, statusShape, statusWord, type Item as ItemModel, type ServicesPayload, type ServiceView } from "@hub/core";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useCallback, useEffect, useState } from "react";
import { Item, statusText } from "@/components/item/Item";
import { AddService } from "@/components/services/AddService";
import { ServiceForm } from "@/components/services/ServiceForm";
import { pct, UptimeStrip } from "@/components/services/UptimeStrip";
import { useHub } from "@/components/shell/HubProvider";
import { useToast } from "@/components/shell/Toast";
import { duration, hhmm } from "@/lib/format";

function toItem(s: ServiceView, editing: boolean): ItemModel {
  const origin = editing ? (s.origin === "yaml" ? " · from hub.yaml" : " · added here") : "";
  return {
    id: `checks:${s.id}`,
    source: "checks",
    kind: "service",
    title: s.name,
    context: `${s.node} · ${s.detail}${origin}`,
    time: new Date(s.checkedAt ?? Date.now()).toISOString(),
    status: s.status,
    route: "fyi",
    actions: [],
    href: s.url,
  };
}

const STATE_WORD: Record<string, string> = { up: "up", slow: "slow", failed: "down" };

/** "up 3 d", "down 12 min", "up 7 d+": how long the service has been in its current state. */
function sinceLabel(s: ServiceView): string | undefined {
  if (s.since === null || !STATE_WORD[s.status]) return undefined;
  return `${STATE_WORD[s.status]} ${duration(s.since)}${s.sinceAtLeast ? "+" : ""}`;
}

function useServices() {
  const { client } = useHub();
  const [data, setData] = useState<ServicesPayload | null>(null);
  const [error, setError] = useState<string | null>(null);
  const reload = useCallback(async () => {
    try {
      setData(await client.services());
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
  return { data, error, reload };
}

export default function ServicesPage() {
  return (
    <Suspense>
      <Services />
    </Suspense>
  );
}

function Services() {
  const { client, refresh } = useHub();
  const toast = useToast();
  const { data, error, reload } = useServices();
  const params = useSearchParams();
  const router = useRouter();
  const editing = params.has("edit") || params.has("add");
  const [editId, setEditId] = useState<string | null>(null);

  const setEditing = (on: boolean) => {
    setEditId(null);
    router.replace(on ? "/services?edit=1" : "/services", { scroll: false });
  };

  if (error && !data) {
    return (
      <p role="alert" className="rounded-xl border border-line bg-surface p-4">
        <span className="text-st-failed">■ Can&apos;t reach the hub.</span> <span className="text-muted">{error}</span>
      </p>
    );
  }
  if (!data) return <div aria-busy="true" aria-label="Loading services" className="h-64 animate-pulse rounded-xl bg-surface" />;

  const services = data.services;
  const byNode = new Map<string, ServiceView[]>();
  for (const s of services) byNode.set(s.node, [...(byNode.get(s.node) ?? []), s]);
  // Problems first inside each node, so the eye lands on what is wrong.
  const rank = (s: ServiceView) => ["failed", "slow"].indexOf(s.status) + 1 || 3;
  const withData = services.filter((s) => s.history.uptime24h !== null);
  const checked = services.map((s) => s.checkedAt).filter((t): t is number => t !== null);
  const lastCheck = checked.length && !data.sample ? Math.max(...checked) : null;
  const overall = withData.length ? withData.reduce((n, s) => n + s.history.uptime24h!, 0) / withData.length : null;

  async function remove(s: ServiceView) {
    const r = await client.removeService(s.id);
    toast({
      ...r,
      action: r.ok
        ? {
            label: "Undo",
            run: () =>
              void client.restoreService(s.id).then((u) => {
                toast(u);
                void reload();
                void refresh();
              }),
          }
        : undefined,
    });
    void reload();
    void refresh();
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-baseline gap-x-3.5 gap-y-2">
        <h1 className="text-[30px] font-semibold tracking-tight">Services</h1>
        <p className="text-muted">
          {STATUSES.filter((st) => services.some((s) => s.status === st))
            .map((st) => (
              <span key={st} className={statusText[st]}>
                {statusShape[st]} {services.filter((s) => s.status === st).length} {statusWord[st].toLowerCase()}
              </span>
            ))
            .flatMap((el, i) => (i ? [" · ", el] : [el]))}
          {overall !== null && <> · {pct(overall)} up in 24 h</>}
          {lastCheck !== null && (
            <>
              {" · "}Checked <time dateTime={new Date(lastCheck).toISOString()}>{hhmm(new Date(lastCheck))}</time>
            </>
          )}
        </p>
        {!data.sample && !editing && (
          <button
            type="button"
            onClick={() => setEditing(true)}
            className="ml-auto min-h-11 rounded-[10px] border border-line px-3.5 text-fg hover:bg-raised"
          >
            Edit services
          </button>
        )}
      </div>

      {data.sample && (
        <p className="rounded-xl border border-dashed border-line p-4 text-[13px] text-muted">
          These are sample services. Add a real one below, or list them in <code className="font-mono">hub.yaml</code>, and the
          hub starts checking every minute and keeping 7 days of history.
        </p>
      )}

      {editing && (
        <div role="status" className="flex flex-wrap items-center gap-3 rounded-xl bg-accent/15 px-4 py-2.5 text-[13px] text-accent-soft">
          <span className="flex-1">
            Editing. Changes save right away; removing a hub.yaml service only hides it here.
          </span>
          <button type="button" onClick={() => setEditing(false)} className="min-h-9 rounded-lg bg-accent px-3 font-semibold text-on-accent">
            Done
          </button>
        </div>
      )}

      {(editing || data.sample) && <AddService nodes={data.nodes} onAdded={() => void reload()} />}

      {[...byNode].map(([node, list]) => (
        <section key={node} aria-labelledby={`node-${node}`} className="flex flex-col rounded-xl border border-line bg-surface px-4 py-2">
          <h2 id={`node-${node}`} className="label-caps py-2">
            {node}
          </h2>
          {list
            .sort((a, b) => rank(a) - rank(b) || a.name.localeCompare(b.name))
            .map((s) => {
              const item = toItem(s, editing);
              if (editing && editId === s.id) {
                return (
                  <div key={s.id} className="py-2">
                    <ServiceForm
                      initial={s}
                      nodes={data.nodes}
                      submitLabel={`Save ${s.name}`}
                      onCancel={() => setEditId(null)}
                      onSubmit={async (input) => {
                        const r = await client.updateService(s.id, input);
                        if (r.ok) {
                          toast(r);
                          setEditId(null);
                          void reload();
                          void refresh();
                        }
                        return r;
                      }}
                    />
                  </div>
                );
              }
              if (editing) {
                return (
                  <div key={s.id} className="rounded-lg">
                    <Item
                      item={item}
                      variant="row"
                      timeLabel={sinceLabel(s)}
                      aside={
                        <>
                          <UptimeStrip history={s.history} />
                          <button
                            type="button"
                            onClick={() => setEditId(s.id)}
                            aria-label={`Edit ${s.name}`}
                            className="min-h-11 rounded-lg border border-line px-3 text-[13px] text-fg hover:bg-raised"
                          >
                            Edit
                          </button>
                          <button
                            type="button"
                            onClick={() => void remove(s)}
                            aria-label={`Remove ${s.name}`}
                            className="min-h-11 rounded-lg border border-line px-3 text-[13px] text-st-failed hover:bg-raised"
                          >
                            Remove
                          </button>
                        </>
                      }
                    />
                  </div>
                );
              }
              return (
                // The <article> inside gives the link no accessible name, so it needs its own label.
                <a
                  key={s.id}
                  href={s.url}
                  aria-label={`${s.name}: ${statusWord[s.status]}, ${item.context}${sinceLabel(s) ? `, ${sinceLabel(s)}` : ""}${s.history.uptime24h !== null ? `, ${pct(s.history.uptime24h)} up in 24 hours` : ""}`}
                  className="block rounded-lg text-fg hover:bg-raised"
                >
                  <Item item={item} variant="row" timeLabel={sinceLabel(s)} aside={<UptimeStrip history={s.history} />} />
                </a>
              );
            })}
        </section>
      ))}
    </div>
  );
}
