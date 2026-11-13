import net from "node:net";
import { afterAll, describe, expect, it } from "vitest";
import { probe } from "./probes";

const server = net.createServer((s) => s.end());
const port = await new Promise<number>((r) => server.listen(0, "127.0.0.1", () => r((server.address() as net.AddressInfo).port)));
afterAll(() => server.close());

describe("probes", () => {
  it("tcp: connects to an open port and names a refused one", async () => {
    await expect(probe(new URL(`tcp://127.0.0.1:${port}`), 2000)).resolves.toBeUndefined();
    const closed = await new Promise<number>((r) => {
      const s = net.createServer().listen(0, "127.0.0.1", () => {
        const p = (s.address() as net.AddressInfo).port;
        s.close(() => r(p));
      });
    });
    await expect(probe(new URL(`tcp://127.0.0.1:${closed}`), 2000)).rejects.toThrow(`Port ${closed} refused`);
  });
  it("rejects what it can't check", async () => {
    await expect(probe(new URL("tcp://redis"), 1000)).rejects.toThrow("needs a port");
    await expect(probe(new URL("ftp://x"), 1000)).rejects.toThrow("Can't check ftp://");
  });
});
