import type { NextConfig } from "next";

// HUB_STATIC=1 builds the public demo: a static export where the mock hub runs in the browser.
const isStatic = process.env.HUB_STATIC === "1";

const config: NextConfig = {
  ...(isStatic
    ? {
        output: "export",
        basePath: process.env.NEXT_PUBLIC_BASE_PATH || undefined,
        trailingSlash: true,
      }
    : {
        // Standalone output keeps the arm64 image small (phase 2).
        output: "standalone",
      }),
  // Lint runs once at the repo root (pnpm lint), not again inside next build.
  eslint: { ignoreDuringBuilds: true },
  transpilePackages: ["@hub/core", "@hub/tokens", "@hub/adapter-mock"],
};

export default config;
