import { TRPCError } from "@trpc/server";
import { updateProfileInput } from "@examgpt/validators";
import { createTRPCRouter, protectedProcedure } from "../trpc";

export const userRouter = createTRPCRouter({
  me: protectedProcedure.query(async ({ ctx }) => {
    // Upsert so local dev works when Clerk webhook is not configured.
    // Webhook still overwrites email/name when it arrives.
    return ctx.db.user.upsert({
      where: { id: ctx.userId },
      create: { id: ctx.userId },
      update: {},
      include: { exam: true },
    });
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
    // Phase 7: snapshot file keys → cleanup job (R2/Qdrant/mem0) → cascade DB delete.
    // Clerk user deletion remains client/dashboard driven; webhook also emits user/deleted.
    const existing = await ctx.db.user.findUnique({
      where: { id: ctx.userId },
    });
    if (!existing) {
      throw new TRPCError({ code: "NOT_FOUND", message: "User not found" });
    }
    const docs = await ctx.db.document.findMany({
      where: { userId: ctx.userId },
      select: { fileKey: true },
    });
    const fileKeys = docs
      .map((d) => d.fileKey)
      .filter((k): k is string => Boolean(k));
    if (ctx.emitEvent) {
      await ctx.emitEvent("user/deleted", {
        userId: ctx.userId,
        fileKeys,
      });
    }
    await ctx.db.user.delete({ where: { id: ctx.userId } });
    return { ok: true as const };
  }),

  /** Phase 7 — own AI usage summary (last 30 days). */
  aiUsageSummary: protectedProcedure.query(async ({ ctx }) => {
    const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const rows = await ctx.db.aiUsageLog.groupBy({
      by: ["task", "model"],
      where: { userId: ctx.userId, createdAt: { gte: since } },
      _sum: { tokensIn: true, tokensOut: true, costUsd: true },
      _count: true,
      _avg: { latencyMs: true },
    });
    const totals = await ctx.db.aiUsageLog.aggregate({
      where: { userId: ctx.userId, createdAt: { gte: since } },
      _sum: { tokensIn: true, tokensOut: true, costUsd: true },
      _count: true,
    });
    return {
      since: since.toISOString(),
      byTask: rows.map((r) => ({
        task: r.task,
        model: r.model,
        calls: r._count,
        tokensIn: r._sum.tokensIn ?? 0,
        tokensOut: r._sum.tokensOut ?? 0,
        costUsd: r._sum.costUsd ?? 0,
        avgLatencyMs: r._avg.latencyMs ?? null,
      })),
      totals: {
        calls: totals._count,
        tokensIn: totals._sum.tokensIn ?? 0,
        tokensOut: totals._sum.tokensOut ?? 0,
        costUsd: totals._sum.costUsd ?? 0,
      },
    };
  }),
});
