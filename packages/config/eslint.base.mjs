/**
 * Shared ESLint base for ExamGPT packages/apps.
 * Apps extend this and add framework-specific configs (Next, etc.).
 */
import { defineConfig, globalIgnores } from "eslint/config";

export const examgptIgnores = globalIgnores([
  "**/node_modules/**",
  "**/dist/**",
  "**/.next/**",
  "**/.turbo/**",
  "**/.expo/**",
  "**/coverage/**",
]);

export default defineConfig([
  examgptIgnores,
  {
    rules: {
      "no-console": ["warn", { allow: ["warn", "error"] }],
      "prefer-const": "error",
    },
  },
]);
