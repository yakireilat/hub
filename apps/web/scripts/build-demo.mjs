// Builds the static public demo. Route handlers need a server, so they are moved aside
// for the export build and always put back afterwards.
import { execSync } from "node:child_process";
import { existsSync, renameSync } from "node:fs";
import process from "node:process";

const api = "src/app/api";
const parked = ".api-parked";

if (existsSync(parked)) throw new Error(`${parked} exists — a previous demo build was interrupted; move it back to ${api}`);
renameSync(api, parked);
try {
  execSync("next build", {
    stdio: "inherit",
    env: { ...process.env, HUB_STATIC: "1", NEXT_PUBLIC_HUB_MODE: "demo" },
  });
} finally {
  renameSync(parked, api);
}
