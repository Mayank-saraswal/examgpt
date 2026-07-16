import type { NextConfig } from "next";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { loadEnvConfig } from "@next/env";

const appDir = path.dirname(fileURLToPath(import.meta.url));
// Monorepo root (bun.lock) — required so Turbopack resolves `next` + workspace packages
const monorepoRoot = path.join(appDir, "../..");

// Load root .env so NEXT_PUBLIC_* works when running from apps/web in a monorepo
loadEnvConfig(monorepoRoot);
loadEnvConfig(appDir);

const nextConfig: NextConfig = {
  transpilePackages: [
    "@examgpt/api",
    "@examgpt/ui-tokens",
    "@examgpt/validators",
  ],
  turbopack: {
    root: monorepoRoot,
  },
  images: {
    // Local marketing screenshots in /public
    unoptimized: process.env.NODE_ENV === "development",
  },
};

export default nextConfig;
