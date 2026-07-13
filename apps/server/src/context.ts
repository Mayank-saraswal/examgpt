import { createContextInner } from "@examgpt/api/context";
import type { CreateExpressContextOptions } from "@trpc/server/adapters/express";

/**
 * Express → tRPC context.
 * Phase 1: verify Clerk JWT from Authorization header into userId.
 */
export async function createContext({ req }: CreateExpressContextOptions) {
  const authHeader = req.headers.authorization;
  const userId =
    typeof authHeader === "string" && authHeader.startsWith("Bearer ")
      ? authHeader.slice("Bearer ".length) || null
      : null;

  return createContextInner({ userId });
}
