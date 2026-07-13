import type { NextConfig } from "next";
import path from "node:path";
import { fileURLToPath } from "node:url";

const appDir = path.dirname(fileURLToPath(import.meta.url));
// Monorepo root (bun.lock) — required so Turbopack resolves `next` + workspace packages
const monorepoRoot = path.join(appDir, "../..");

const nextConfig: NextConfig = {
  transpilePackages: [
    "@examgpt/api",
    "@examgpt/ui-tokens",
    "@examgpt/validators",
  ],
  turbopack: {
    root: monorepoRoot,
  },
};

export default nextConfig;
