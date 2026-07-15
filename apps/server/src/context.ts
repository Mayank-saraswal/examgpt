import { createContextInner } from "@examgpt/api/context";
import type { CreateExpressContextOptions } from "@trpc/server/adapters/express";
import { getAuth } from "@clerk/express";
import { createStorage } from "./storage";
import { inngest } from "./inngest/client";
import { clerkConfigured, env } from "./env";
import { logger } from "./logger";

const storage = createStorage();

/**
 * Express → tRPC context.
 * userId is taken ONLY from verified Clerk session JWT (never client body).
 * @see https://clerk.com/docs/references/express/overview
 */
export async function createContext({ req }: CreateExpressContextOptions) {
  let userId: string | null = null;
  let role: string | null = null;

  if (clerkConfigured()) {
    try {
      const auth = getAuth(req);
      if (auth.isAuthenticated && auth.userId) {
        userId = auth.userId;
        // publicMetadata is on session claims when configured in Clerk session token
        const claims = auth.sessionClaims as
          | { public_metadata?: { role?: string }; metadata?: { role?: string } }
          | undefined;
        const meta =
          claims?.public_metadata ??
          (claims as { publicMetadata?: { role?: string } } | undefined)
            ?.publicMetadata ??
          claims?.metadata;
        if (meta && typeof meta === "object" && "role" in meta) {
          role = typeof meta.role === "string" ? meta.role : null;
        }
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
    // Dev bypass: X-ExamGPT-Role: admin + user in allowlist
    const devRole = req.headers["x-examgpt-role"];
    if (typeof devRole === "string") role = devRole;
  }

  return createContextInner({
    userId,
    role,
    adminUserIds: env.ADMIN_USER_IDS,
    storage,
    pageQuota: env.INGEST_PAGE_QUOTA,
    emitEvent: async (name, data) => {
      await inngest.send({ name, data });
    },
  });
}
