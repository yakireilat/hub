import { execFile } from "node:child_process";
import net from "node:net";
import type { Probe } from "@hub/adapter-checks";

// Host names and IP addresses only, so nothing can be read as a command-line option.
const SAFE_HOST = /^[a-z0-9][a-z0-9.\-:[\]]*$/i;

function tcp(host: string, port: number, timeoutMs: number): Promise<void> {
  return new Promise((resolve, reject) => {
    const socket = net.connect({ host, port });
    const done = (err?: Error) => {
      socket.destroy();
      if (err) reject(err);
      else resolve();
    };
    socket.setTimeout(timeoutMs);
    socket.once("connect", () => done());
    socket.once("timeout", () => done(new Error(`No answer in ${timeoutMs / 1000} s`)));
    socket.once("error", (e: NodeJS.ErrnoException) =>
      done(new Error(e.code === "ECONNREFUSED" ? `Port ${port} refused` : e.code === "ENOTFOUND" ? "Unknown host" : "Unreachable")),
    );
  });
}

/** One ICMP echo through the system ping; Docker allows unprivileged ping by default. */
function ping(host: string, timeoutMs: number): Promise<void> {
  return new Promise((resolve, reject) => {
    const seconds = String(Math.max(1, Math.round(timeoutMs / 1000)));
    execFile("ping", ["-c", "1", "-W", seconds, host], { timeout: timeoutMs + 1000 }, (err, _out, stderr) => {
      if (!err) return resolve();
      if (/permission|not permitted/i.test(stderr)) return reject(new Error("Ping isn't allowed in this container"));
      reject(new Error("No reply to ping"));
    });
  });
}

/** tcp://host:port and ping://host checks for the monitor. */
export const probe: Probe = async (target, timeoutMs) => {
  const host = target.hostname.replace(/^\[|\]$/g, "");
  if (!SAFE_HOST.test(host)) throw new Error("Not a host name");
  if (target.protocol === "tcp:") {
    const port = Number(target.port);
    if (!port) throw new Error("tcp:// needs a port, e.g. tcp://redis:6379");
    return tcp(host, port, timeoutMs);
  }
  if (target.protocol === "ping:") return ping(host, timeoutMs);
  throw new Error(`Can't check ${target.protocol}// addresses`);
};
