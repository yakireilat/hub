import { describe, expect, it } from "vitest";
import { nodeKey, pick } from "./nodes";

describe("node matching", () => {
  it("drops a domain from host names but keeps IP addresses whole", () => {
    expect(nodeKey("core-01.tail1234.ts.net")).toBe("core-01");
    expect(nodeKey("172.19.0.30:9100")).toBe("172.19.0.30:9100");
    expect(nodeKey("172.19.0.30")).toBe("172.19.0.30");
  });
  it("prefers the configured alias, exactly as written", () => {
    const m = new Map([["172.19.0.30:9100", "a"], ["core-01", "b"], ["172", "wrong"]]);
    expect(pick(m, "core-01", "172.19.0.30:9100")).toBe("a");
    expect(pick(m, "core-01")).toBe("b");
    expect(pick(m, "odin")).toBeUndefined();
  });
});
