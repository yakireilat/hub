import type { UptimeSummary } from "@hub/core";
import { hhmm } from "@/lib/format";

const BAR: Record<string, string> = {
  up: "h-full bg-st-up",
  slow: "h-2/3 bg-st-slow",
  failed: "h-1/3 bg-st-failed",
};

export const pct = (share: number | null) =>
  share === null ? "—" : `${(Math.floor(share * 1000) / 10).toLocaleString("en", { maximumFractionDigits: 1 })}%`;

/**
 * The last 24 hours, one bar per hour. Height carries the status as well as colour (full = up,
 * two-thirds = slow, one-third = failed, a dash = no checks), and the label says it in words.
 */
export function UptimeStrip({ history }: { history: UptimeSummary }) {
  if (!history.buckets.length) return null;
  const label =
    history.uptime24h === null
      ? "No checks in the last 24 hours yet"
      : `Last 24 hours: ${pct(history.uptime24h)} up, ${history.failures24h} failed ${history.failures24h === 1 ? "check" : "checks"}. 7 days: ${pct(history.uptime7d)} up.`;

  return (
    <div className="flex items-center gap-2.5" data-testid="uptime">
      <div role="img" aria-label={label} title={label} className="flex h-6 items-end gap-[2px]">
        {history.buckets.map((b) => (
          <span
            key={b.start}
            aria-hidden="true"
            title={`${hhmm(new Date(b.start))} · ${b.checks ? `${b.checks} checks${b.failed ? `, ${b.failed} failed` : ""}` : "no checks"}`}
            className={`w-1 rounded-[1px] ${b.status ? BAR[b.status] : "h-[2px] bg-line"}`}
          />
        ))}
      </div>
      <span className="w-14 text-right font-mono text-xs text-muted" aria-hidden="true">
        {pct(history.uptime24h)}
      </span>
    </div>
  );
}
