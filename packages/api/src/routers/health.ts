import { healthPingOutput } from "@examgpt/validators";
import { createTRPCRouter, publicProcedure } from "../trpc";

/**
 * Public health router — intentional exception to protected-by-default.
 * Used by web/mobile Phase 0 smoke screens and load balancers.
 */
export const healthRouter = createTRPCRouter({
  ping: publicProcedure.output(healthPingOutput).query(() => {
    return {
      ok: true as const,
      service: "examgpt-api",
      timestamp: new Date().toISOString(),
    };
  }),
});
