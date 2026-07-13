import { TRPCError } from "@trpc/server";
import { updateProfileInput } from "@examgpt/validators";
import { createTRPCRouter, protectedProcedure } from "../trpc";

export const userRouter = createTRPCRouter({
  me: protectedProcedure.query(async ({ ctx }) => {
    const user = await ctx.db.user.findUnique({
      where: { id: ctx.userId },
      include: { exam: true },
    });
    if (!user) {
      // Webhook may lag; return a stub until sync completes
      return {
        id: ctx.userId,
        email: null,
        phone: null,
        name: null,
        age: null,
        onboarded: false,
        exam: null,
      };
    }
    return user;
  }),

  updateProfile: protectedProcedure
    .input(updateProfileInput)
    .mutation(async ({ ctx, input }) => {
      return ctx.db.user.upsert({
        where: { id: ctx.userId },
        create: {
          id: ctx.userId,
          name: input.name,
          age: input.age,
        },
        update: {
          ...(input.name !== undefined ? { name: input.name } : {}),
          ...(input.age !== undefined ? { age: input.age } : {}),
        },
        include: { exam: true },
      });
    }),

  deleteAccount: protectedProcedure.mutation(async ({ ctx }) => {
    // Soft path: delete local rows; Clerk deletion is client/dashboard driven.
    // Full R2/Qdrant cleanup lands with user.deleted webhook (Phase 1 + later).
    const existing = await ctx.db.user.findUnique({ where: { id: ctx.userId } });
    if (!existing) {
      throw new TRPCError({ code: "NOT_FOUND", message: "User not found" });
    }
    await ctx.db.user.delete({ where: { id: ctx.userId } });
    return { ok: true as const };
  }),
});
