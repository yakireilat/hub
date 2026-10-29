import { createHub } from "@hub/core";
import { describe, expect, it } from "vitest";
import { createMockAdapters } from "./index";

const fixed = () => new Date("2026-10-29T10:42:00");

describe("mock adapters", () => {
  it("start with two things needing you", async () => {
    const today = await createHub(createMockAdapters(fixed)).today();
    expect(today.verdict).toBe("Two things need you");
    expect(today.runs).toEqual({ total: 24, ok: 23, failed: 1 });
  });

  it("acting clears the item", async () => {
    const hub = createHub(createMockAdapters(fixed));
    expect((await hub.act("n8n:backup", "retry")).ok).toBe(true);
    expect((await hub.act("calendar:dentist", "accept")).ok).toBe(true);
    expect((await hub.today()).verdict).toBe("Nothing needs you");
  });
});
