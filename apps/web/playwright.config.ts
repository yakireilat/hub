import { rmSync } from "node:fs";
import path from "node:path";
import { defineConfig, devices } from "@playwright/test";

// A fresh database per run, so services added by one run never leak into the next.
const dataDir = path.join(import.meta.dirname, ".e2e-data");
rmSync(dataDir, { recursive: true, force: true });

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: false,
  retries: process.env.CI ? 1 : 0,
  use: { baseURL: "http://localhost:3000", trace: "retain-on-failure" },
  projects: [
    { name: "desktop", use: { ...devices["Desktop Chrome"] } },
    { name: "phone", use: { ...devices["iPhone 13"], browserName: "chromium" } },
  ],
  webServer: {
    command: process.env.CI ? "pnpm build && pnpm start" : "pnpm dev",
    url: "http://localhost:3000/api/health",
    reuseExistingServer: !process.env.CI,
    timeout: 180_000,
    env: { HUB_DATA_DIR: dataDir },
  },
});
