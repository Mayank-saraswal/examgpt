import { defineWorkspace } from "vitest/config";

export default defineWorkspace([
  "packages/*/vitest.config.ts",
  "packages/*/vite.config.ts",
  {
    test: {
      name: "validators",
      root: "./packages/validators",
      include: ["src/**/*.test.ts"],
    },
  },
]);
