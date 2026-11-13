import type { NodesPayload, NodeView } from "@hub/core";
import { statusText } from "@/components/item/Item";
import { duration } from "@/lib/format";

/** Bars turn amber past 80 % and red past 90 %; the number is always printed beside them. */
function tone(pct: number) {
  return pct >= 90 ? "bg-st-failed" : pct >= 80 ? "bg-st-slow" : "bg-st-info";
}

function Meter({ label, pct, text }: { label: string; pct: number | null; text: string }) {
  return (
    <div className="flex items-center gap-2 text-xs">
      <span className="w-10 text-muted">{label}</span>
      <span aria-hidden="true" className="h-1.5 flex-1 overflow-hidden rounded-full bg-divider">
        {pct !== null && <span className={`block h-full ${tone(pct)}`} style={{ width: `${Math.min(100, Math.max(2, pct))}%` }} />}
      </span>
      <span className="w-16 text-right font-mono">{text}</span>
    </div>
  );
}

const gb = (bytes: number) => `${(bytes / 1e9).toFixed(bytes >= 1e10 ? 0 : 1)} GB`;

function presenceLine(n: NodeView): { status: "up" | "idle" | "info"; text: string } {
  if (!n.presence) return { status: "info", text: "Not on the tailnet" };
  if (n.presence.online) return { status: "up", text: "Online" };
  return { status: "idle", text: n.presence.lastSeen ? `Offline · seen ${duration(n.presence.lastSeen)} ago` : "Offline" };
}

const SHAPE = { up: "●", idle: "◌", info: "◆" } as const;

function Tile({ n, tailscaleOn }: { n: NodeView; tailscaleOn: boolean }) {
  const p = tailscaleOn ? presenceLine(n) : null;
  const m = n.metrics;
  const summary = [
    p?.text,
    n.services ? `${n.services} services${n.failing ? `, ${n.failing} failing` : ""}` : null,
    m ? `CPU ${Math.round(m.cpu ?? 0)}%, memory ${Math.round(m.memory ?? 0)}%, disk ${Math.round(m.disk ?? 0)}%` : null,
  ]
    .filter(Boolean)
    .join(". ");

  return (
    <article aria-label={`${n.id}. ${summary}`} className={`flex flex-col gap-2.5 rounded-xl border border-line bg-surface p-3.5 ${p?.status === "idle" ? "opacity-70" : ""}`} data-testid="node">
      <div className="flex items-baseline justify-between gap-2">
        <h3 className="font-semibold">{n.id}</h3>
        {n.presence?.address && <span className="font-mono text-[11px] text-muted">{n.presence.address}</span>}
      </div>
      {p && (
        <p className="text-[13px]">
          <span className={statusText[p.status]}>
            {SHAPE[p.status]} {p.text}
          </span>
          {n.presence?.os && <span className="text-muted"> · {n.presence.os}</span>}
        </p>
      )}
      {m ? (
        <div className="flex flex-col gap-1.5">
          <Meter label="CPU" pct={m.cpu} text={m.cpu === null ? "—" : `${Math.round(m.cpu)}%`} />
          <Meter label="RAM" pct={m.memory} text={m.memory === null ? "—" : m.memoryTotalBytes ? `${gb((m.memory / 100) * m.memoryTotalBytes)}` : `${Math.round(m.memory)}%`} />
          <Meter label="Disk" pct={m.disk} text={m.disk === null ? "—" : `${Math.round(m.disk)}%`} />
          {m.tempC !== null && <Meter label="Temp" pct={Math.min(100, (m.tempC / 95) * 100)} text={`${Math.round(m.tempC)} °C`} />}
        </div>
      ) : (
        <p className="text-xs text-muted">No metrics: node-exporter isn&apos;t reporting for this machine.</p>
      )}
      {n.services > 0 && (
        <p className="text-xs text-muted">
          {n.services} {n.services === 1 ? "service" : "services"}
          {n.failing > 0 && <span className="text-st-failed"> · ■ {n.failing} failing</span>}
        </p>
      )}
    </article>
  );
}

export function NodeTiles({ data }: { data: NodesPayload }) {
  if (!data.nodes.length) return null;
  const notes = [
    data.sources.tailscale === "off" && !data.sample && "Online state needs a Tailscale API client (TS_API_CLIENT_ID).",
    data.sources.tailscale === "error" && "Tailscale didn't answer, so online state is missing.",
    data.sources.prometheus === "off" && !data.sample && "Metrics need a prometheus: address in hub.yaml.",
    data.sources.prometheus === "error" && "Prometheus didn't answer, so metrics are missing.",
    ...data.unmatchedExporters.map(
      (e) =>
        `Prometheus has a node-exporter at ${e.instance}${e.hostname ? ` (hostname ${e.hostname})` : ""} that matches no node. Set instance: "${e.instance}" on its node in hub.yaml.`,
    ),
  ].filter(Boolean) as string[];

  return (
    <section aria-labelledby="nodes" className="flex flex-col gap-2.5">
      <h2 id="nodes" className="label-caps">
        Nodes
      </h2>
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {data.nodes.map((n) => (
          <Tile key={n.id} n={n} tailscaleOn={data.sources.tailscale !== "off" || data.sample} />
        ))}
      </div>
      {notes.map((t) => (
        <p key={t} className="text-xs text-st-slow">
          ▲ {t}
        </p>
      ))}
    </section>
  );
}
