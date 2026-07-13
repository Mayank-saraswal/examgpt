import { initTRPC, TRPCError } from "@trpc/server";
import type { Context } from "./context";

const t = initTRPC.context<Context>().create({
  errorFormatter({ shape }) {
    return shape;
  },
});

export const createTRPCRouter = t.router;
export const createCallerFactory = t.createCallerFactory;
/**
 * Public procedures are rare — must justify with a comment at call site.
 * health.ping is the Phase 0 intentional exception.
 */
export const publicProcedure = t.procedure;

/**
 * Protected-by-default base. userId always comes from Clerk JWT in context —
 * never from client input.
 */
export const protectedProcedure = t.procedure.use(({ ctx, next }) => {
  if (!ctx.userId) {
    throw new TRPCError({ code: "UNAUTHORIZED" });
  }
  return next({
    ctx: {
      ...ctx,
      userId: ctx.userId,
    },
  });
});
