import { createContextInner } from "@examgpt/api/context";
import type { CreateExpressContextOptions } from "@trpc/server/adapters/express";
import { getAuth } from "@clerk/express";
import { createR2Storage } from "./storage/r2";
import { inngest } from "./inngest/client";
import { clerkConfigured, env } from "./env";
import { logger } from "./logger";

const storage = createR2Storage();

/**
 * Express → tRPC context.
 * userId is taken ONLY from verified Clerk session JWT (never client body).
 * @see https://clerk.com/docs/references/express/overview
 */
export async function createContext({ req }: CreateExpressContextOptions) {
  let userId: string | null = null;

  if (clerkConfigured()) {
    try {
      const auth = getAuth(req);
      if (auth.isAuthenticated && auth.userId) {
        userId = auth.userId;
      }
    } catch (err) {
      logger.warn({ err }, "Clerk getAuth failed");
    }
  } else if (env.NODE_ENV === "development") {
    const authHeader = req.headers.authorization;
    if (
      typeof authHeader === "string" &&
      authHeader.startsWith("Bearer user_")
    ) {
      userId = authHeader.slice("Bearer ".length);
    }
  }

  return createContextInner({
    userId,
    storage,
    pageQuota: env.INGEST_PAGE_QUOTA,
    emitEvent: async (name, data) => {
      await inngest.send({ name, data });
    },
  });
}
