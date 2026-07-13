import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";
import examgptBase from "@examgpt/config/eslint.base.mjs";

const eslintConfig = defineConfig([
  ...examgptBase,
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    // Vendored shadcn/ui (generated components; lint noise not product code)
    "src/components/ui/**",
    "src/hooks/use-mobile.ts",
  ]),
]);

export default eslintConfig;
