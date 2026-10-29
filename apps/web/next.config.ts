import type { NextConfig } from "next";

const config: NextConfig = {
  // Standalone output keeps the arm64 image small (phase 2).
  output: "standalone",
  // Lint runs once at the repo root (pnpm lint), not again inside next build.
  eslint: { ignoreDuringBuilds: true },
  transpilePackages: ["@hub/core", "@hub/tokens", "@hub/adapter-mock"],
};

export default config;
