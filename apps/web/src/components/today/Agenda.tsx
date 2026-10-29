import type { Item } from "@hub/core";
import { hhmm } from "@/lib/format";
import { statusText } from "@/components/item/Item";

/** Today's events with a now-line at `now`. */
export function Agenda({ events, now }: { events: Item[]; now: Date }) {
  const nowIndex = events.findIndex((e) => new Date(e.time) > now);
  const rows = events.map((e, i) => ({ e, past: nowIndex === -1 || i < nowIndex }));

  return (
    <ol className="rounded-xl border border-line bg-surface py-1.5" aria-label="Agenda">
      {rows.map(({ e, past }, i) => (
        <li key={e.id}>
          {i === nowIndex && <NowLine now={now} />}
          <div className={`flex gap-3.5 px-3.5 py-2.5 ${past ? "opacity-55" : ""}`}>
            <time dateTime={e.time} className="w-11 font-mono text-xs text-muted">
              {hhmm(e.time)}
            </time>
            <span aria-hidden="true" className={`w-[3px] rounded-sm bg-current ${statusText[e.status]}`} />
            <div className="flex flex-col gap-0.5">
              <span className="font-medium">{e.title}</span>
              <span className="text-xs text-muted">
                {e.kind === "invite" ? "Invite · not answered" : e.context}
              </span>
            </div>
          </div>
        </li>
      ))}
      {nowIndex === -1 && (
        <li>
          <NowLine now={now} />
        </li>
      )}
    </ol>
  );
}

function NowLine({ now }: { now: Date }) {
  return (
    <div className="flex items-center gap-2 px-3.5 py-0.5" data-testid="now-line">
      <span className="font-mono text-[11px] text-accent">{hhmm(now)}</span>
      <span aria-hidden="true" className="h-0.5 flex-1 bg-accent" />
    </div>
  );
}
