import { statusShape, statusWord } from "@hub/core";
import Link from "next/link";
import { Suspense } from "react";
import { Item, statusText } from "@/components/item/Item";
import { Agenda } from "@/components/today/Agenda";
import { Capture } from "@/components/today/Capture";
import { getHub } from "@/lib/hub";
import { hhmm, longDay } from "@/lib/format";

export default async function TodayPage() {
  const now = new Date();
  const today = await getHub().today();
  const fyiRuns = today.runs.ok;

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-baseline gap-3.5">
        <h1 className="text-[30px] font-semibold tracking-tight">{today.verdict}</h1>
        <span className="text-muted">
          {longDay(now)} · {hhmm(now)}
        </span>
      </div>

      <div className="grid items-start gap-5 lg:grid-cols-2">
        <section aria-labelledby="needs" className="flex flex-col gap-2.5">
          <h2 id="needs" className="label-caps">
            Needs attention
          </h2>
          {today.needs.length === 0 ? (
            <p className="rounded-xl border border-line bg-surface p-4 text-muted">
              <span className="text-st-up">● All clear.</span> Nothing is waiting on you.
            </p>
          ) : (
            today.needs.map((item) => <Item key={item.id} item={item} />)
          )}
          <p className="rounded-[10px] border border-dashed border-line px-3.5 py-2.5 text-[13px] text-muted">
            FYI · {fyiRuns} runs succeeded · {today.services.filter((s) => s.status === "up").length} services up
          </p>
          <div className="mt-2.5">
            <Suspense>
              <Capture />
            </Suspense>
          </div>
        </section>

        <section aria-labelledby="agenda" className="flex flex-col gap-2.5">
          <h2 id="agenda" className="label-caps">
            Agenda
          </h2>
          <Agenda events={today.agenda} now={now} />
        </section>
      </div>

      <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">
        <section aria-labelledby="runs" className="flex flex-col gap-3 rounded-xl border border-line bg-surface p-4">
          <h2 id="runs" className="label-caps">
            Automations today
          </h2>
          <dl className="flex gap-6">
            <Stat label="runs" value={today.runs.total} />
            <Stat label={`${statusShape.up} ok`} value={today.runs.ok} tone="text-st-up" />
            <Stat label={`${statusShape.failed} failed`} value={today.runs.failed} tone="text-st-failed" />
          </dl>
          <Link href="/automations" className="text-[13px] text-accent hover:text-accent-soft">
            Open Automations →
          </Link>
        </section>

        <section aria-labelledby="services" className="flex flex-col gap-1 rounded-xl border border-line bg-surface p-4">
          <h2 id="services" className="label-caps mb-1.5">
            Services
          </h2>
          <ul>
            {today.services.map((s) => (
              <li key={s.id} className="flex min-h-8 items-center justify-between">
                <span>{s.title}</span>
                <span className={`text-xs ${statusText[s.status]}`}>
                  {statusShape[s.status]} {statusWord[s.status].toLowerCase()}
                  {s.status === "slow" ? ` · ${(Number(s.meta?.ms) / 1000).toFixed(1)} s` : ""}
                </span>
              </li>
            ))}
          </ul>
        </section>

        <section aria-labelledby="notes" className="flex flex-col gap-2.5 rounded-xl border border-line bg-surface p-4">
          <h2 id="notes" className="label-caps">
            Recent notes
          </h2>
          {today.notes.slice(0, 3).map((n) => (
            <a key={n.id} href={n.href} className="flex min-h-11 flex-col justify-center text-fg">
              <span className="font-medium">{n.title}</span>
              <span className="text-xs text-muted">{n.context}</span>
            </a>
          ))}
        </section>
      </div>
    </div>
  );
}

function Stat({ label, value, tone = "" }: { label: string; value: number; tone?: string }) {
  return (
    <div className="flex flex-col-reverse">
      <dt className="text-xs text-muted">{label}</dt>
      <dd className={`text-[26px] font-semibold ${tone}`}>{value}</dd>
    </div>
  );
}
