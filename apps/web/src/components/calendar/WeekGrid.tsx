"use client";

import type { CalendarEvent, CalendarPayload } from "@hub/core";
import { useEffect, useRef, useState } from "react";
import { clock, dayNumber, layoutLanes, longDate, minutesOfDay, weekdayShort } from "./time";

const HOUR_PX = 48;
const HOURS = Array.from({ length: 24 }, (_, h) => h);

function useNowMinute() {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = window.setInterval(() => setNow(Date.now()), 60_000);
    return () => window.clearInterval(t);
  }, []);
  return now;
}

function EventBlock({
  e,
  tz,
  lane,
  lanes,
  past,
  onSelect,
}: {
  e: CalendarEvent;
  tz: string;
  lane: number;
  lanes: number;
  past: boolean;
  onSelect: (e: CalendarEvent) => void;
}) {
  const startMin = minutesOfDay(tz, e.start);
  // An event running past midnight is cut at the end of its first day.
  const endMin = Math.min(24 * 60, startMin + Math.max(15, (e.end - e.start) / 60_000));
  const height = Math.max(20, ((endMin - startMin) / 60) * HOUR_PX - 2);
  const invite = e.response === "needsAction";
  const label = `${invite ? "Invite: " : ""}${e.title}, ${clock(tz, e.start)} to ${clock(tz, e.end)}${e.location ? `, ${e.location}` : ""}`;

  return (
    <button
      type="button"
      onClick={() => onSelect(e)}
      aria-label={label}
      title={label}
      style={{
        top: (startMin / 60) * HOUR_PX + 1,
        height,
        left: `calc(${(lane / lanes) * 100}% + 2px)`,
        width: `calc(${100 / lanes}% - 4px)`,
      }}
      className={`absolute z-10 flex flex-col overflow-hidden rounded-md border-l-[3px] px-1.5 py-0.5 text-left text-[12px] leading-tight hover:z-20 hover:shadow-lg focus-visible:z-20 ${
        invite ? "border border-dashed border-st-info bg-surface text-fg" : "border-st-info bg-st-info/20 text-fg"
      } ${past ? "opacity-60" : ""}`}
    >
      <span className="truncate font-medium">
        {invite && <span className="text-st-info">Invite · </span>}
        {e.title}
      </span>
      {height >= 34 && (
        <span className="truncate text-muted">
          {clock(tz, e.start)}–{clock(tz, e.end)}
          {e.location ? ` · ${e.location}` : ""}
        </span>
      )}
    </button>
  );
}

/** A Google/Outlook-style week: hours down the side, one column per day, events placed by time. */
export function WeekGrid({
  data,
  onSelectEvent,
  onSelectSlot,
}: {
  data: CalendarPayload;
  onSelectEvent: (e: CalendarEvent) => void;
  /** An empty half hour was clicked: offer a new event there. Absent while events can't be added. */
  onSelectSlot?: (date: string, time: string) => void;
}) {
  const tz = data.timeZone;
  const scroller = useRef<HTMLDivElement>(null);
  const now = useNowMinute();
  const nowMin = minutesOfDay(tz, now);

  // Open on the working day, not at midnight.
  useEffect(() => {
    if (scroller.current) scroller.current.scrollTop = 7 * HOUR_PX - 8;
  }, []);

  const hasAllDay = data.days.some((d) => d.events.some((e) => e.allDay));

  return (
    <div className="overflow-hidden rounded-xl border border-line bg-surface" data-testid="week-grid">
      {/* Day headers and the all-day row stay put while the hours scroll. */}
      <div className="grid border-b border-divider" style={{ gridTemplateColumns: "56px repeat(7, minmax(0, 1fr))" }}>
        <div />
        {data.days.map((d) => {
          const isToday = d.date === data.today;
          return (
            <div key={d.date} className="flex flex-col items-center gap-0.5 border-l border-divider py-2" aria-label={longDate(d.date)}>
              <span className={`label-caps text-[11px]! ${isToday ? "text-accent!" : ""}`}>{weekdayShort(d.date)}</span>
              <span
                className={`flex size-8 items-center justify-center rounded-full text-[17px] font-semibold ${isToday ? "bg-accent text-on-accent" : "text-fg"}`}
              >
                {dayNumber(d.date)}
              </span>
            </div>
          );
        })}
        {hasAllDay && (
          <>
            <div className="flex items-center justify-end pr-2 text-[11px] text-muted">all day</div>
            {data.days.map((d) => (
              <div key={d.date} className="flex min-h-8 flex-col gap-0.5 border-l border-t border-divider p-0.5">
                {d.events
                  .filter((e) => e.allDay)
                  .map((e) => (
                    <button
                      key={e.id}
                      type="button"
                      onClick={() => onSelectEvent(e)}
                      aria-label={`${e.title}, all day`}
                      className="truncate rounded-md bg-st-info/20 px-1.5 py-0.5 text-left text-[12px] font-medium text-fg hover:shadow"
                    >
                      {e.title}
                    </button>
                  ))}
              </div>
            ))}
          </>
        )}
      </div>

      <div ref={scroller} className="max-h-[68vh] overflow-y-auto">
        <div className="relative grid" style={{ gridTemplateColumns: "56px repeat(7, minmax(0, 1fr))", height: 24 * HOUR_PX }}>
          <div className="relative">
            {HOURS.slice(1).map((h) => (
              <span key={h} className="absolute right-2 -translate-y-1/2 font-mono text-[11px] text-muted" style={{ top: h * HOUR_PX }}>
                {String(h).padStart(2, "0")}:00
              </span>
            ))}
          </div>
          {data.days.map((d) => {
            const isToday = d.date === data.today;
            const placed = layoutLanes(d.events.filter((e) => !e.allDay));
            return (
              <div key={d.date} className={`relative border-l border-divider ${isToday ? "bg-accent/[0.03]" : ""}`}>
                {/* Half-hour slots: click one to start a new event there. Off the tab order; "New event" is the keyboard path. */}
                {HOURS.map((h) =>
                  [0, 30].map((m) => {
                    const time = `${String(h).padStart(2, "0")}:${m ? "30" : "00"}`;
                    const line = m ? "border-b border-divider" : "border-b border-dashed border-divider/50";
                    return onSelectSlot ? (
                      <button
                        key={time}
                        type="button"
                        tabIndex={-1}
                        aria-label={`New event ${longDate(d.date)} ${time}`}
                        onClick={() => onSelectSlot(d.date, time)}
                        className={`block w-full hover:bg-raised/60 ${line}`}
                        style={{ height: HOUR_PX / 2 }}
                      />
                    ) : (
                      <div key={time} className={line} style={{ height: HOUR_PX / 2 }} />
                    );
                  }),
                )}
                {placed.map(({ event, lane, lanes }) => (
                  <EventBlock
                    key={event.id}
                    e={event}
                    tz={tz}
                    lane={lane}
                    lanes={lanes}
                    past={event.end < now}
                    onSelect={onSelectEvent}
                  />
                ))}
                {isToday && (
                  <div aria-hidden="true" className="pointer-events-none absolute inset-x-0 z-30 flex items-center" style={{ top: (nowMin / 60) * HOUR_PX }}>
                    <span className="-ml-1 size-2 rounded-full bg-accent" />
                    <span className="h-0.5 flex-1 bg-accent" />
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
