import { describe, expect, it } from "vitest";
import { addDays, layoutLanes, minutesOfDay, rangeLabel } from "./time";

describe("calendar time helpers", () => {
  it("moves dates and labels weeks", () => {
    expect(addDays("2026-11-29", 7)).toBe("2026-12-06");
    expect(rangeLabel("2026-11-15")).toBe("15 – 21 November 2026");
    expect(rangeLabel("2026-11-29")).toBe("29 November – 5 December 2026");
  });
  it("reads minutes in the calendar's zone", () => {
    expect(minutesOfDay("Asia/Jerusalem", Date.UTC(2026, 10, 14, 7, 30))).toBe(9 * 60 + 30);
  });
  it("puts overlapping events side by side and lets later ones reuse free lanes", () => {
    const e = (start: number, end: number) => ({ start, end });
    const out = layoutLanes([e(0, 60), e(30, 90), e(60, 120), e(200, 230)]);
    expect(out.map((o) => [o.event.start, o.lane, o.lanes])).toEqual([
      [0, 0, 2],
      [30, 1, 2],
      [60, 0, 2],
      [200, 0, 1],
    ]);
  });
});
