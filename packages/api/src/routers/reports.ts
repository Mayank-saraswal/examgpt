import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { createTRPCRouter, protectedProcedure } from "../trpc";

export const reportsRouter = createTRPCRouter({
  get: protectedProcedure
    .input(
      z.object({
        attemptId: z.string().min(1).optional(),
        reportId: z.string().min(1).optional(),
      }),
    )
    .query(async ({ ctx, input }) => {
      if (!input.attemptId && !input.reportId) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "attemptId or reportId required",
        });
      }
      const report = await ctx.db.report.findFirst({
        where: {
          userId: ctx.userId,
          ...(input.reportId
            ? { id: input.reportId }
            : { attemptId: input.attemptId }),
        },
        include: {
          attempt: {
            include: {
              test: {
                select: {
                  id: true,
                  title: true,
                  source: true,
                  paperYear: true,
                  durationMin: true,
                },
              },
            },
          },
        },
      });
      if (!report) throw new TRPCError({ code: "NOT_FOUND" });
      return report;
    }),

  listForUser: protectedProcedure
    .input(
      z
        .object({
          limit: z.number().int().min(1).max(50).default(20),
        })
        .optional(),
    )
    .query(async ({ ctx, input }) => {
      const limit = input?.limit ?? 20;
      return ctx.db.report.findMany({
        where: { userId: ctx.userId },
        orderBy: { createdAt: "desc" },
        take: limit,
        select: {
          id: true,
          attemptId: true,
          status: true,
          score: true,
          maxScore: true,
          summary: true,
          topicAnalysis: true,
          createdAt: true,
          updatedAt: true,
          attempt: {
            select: {
              test: { select: { id: true, title: true, source: true } },
              submittedAt: true,
            },
          },
        },
      });
    }),

  /**
   * Dashboard aggregates: score trend + current weak topics + recommended next.
   */
  dashboard: protectedProcedure.query(async ({ ctx }) => {
    const reports = await ctx.db.report.findMany({
      where: { userId: ctx.userId, status: "READY" },
      orderBy: { createdAt: "asc" },
      take: 30,
      select: {
        id: true,
        attemptId: true,
        score: true,
        maxScore: true,
        topicAnalysis: true,
        recommendations: true,
        createdAt: true,
        attempt: {
          select: {
            submittedAt: true,
            test: { select: { title: true } },
          },
        },
      },
    });

    const scoreTrend = reports.map((r) => ({
      reportId: r.id,
      attemptId: r.attemptId,
      score: r.score ?? 0,
      maxScore: r.maxScore ?? 0,
      pct:
        r.maxScore && r.maxScore > 0
          ? Math.round(((r.score ?? 0) / r.maxScore) * 1000) / 10
          : 0,
      title: r.attempt.test.title,
      at: r.attempt.submittedAt ?? r.createdAt,
    }));

    // Merge latest topic verdicts (prefer most recent report)
    const weakMap = new Map<string, string>();
    for (const r of [...reports].reverse()) {
      const topics = r.topicAnalysis as
        | { topic: string; verdict: string }[]
        | null;
      if (!Array.isArray(topics)) continue;
      for (const t of topics) {
        if (t.verdict === "WEAK" && !weakMap.has(t.topic)) {
          weakMap.set(t.topic, t.verdict);
        }
      }
    }

    const latest = reports[reports.length - 1] ?? null;
    const recs = latest?.recommendations as
      | { items?: { priority: number; topic: string; action: string }[] }
      | null;
    const recommendedNext = recs?.items?.[0] ?? null;

    return {
      scoreTrend,
      weakTopics: [...weakMap.keys()].slice(0, 10),
      recommendedNext,
      latestReportId: latest?.id ?? null,
      latestAttemptId: latest?.attemptId ?? null,
    };
  }),

  /** Idempotent re-analysis (force) */
  reanalyze: protectedProcedure
    .input(z.object({ attemptId: z.string().min(1) }))
    .mutation(async ({ ctx, input }) => {
      const attempt = await ctx.db.attempt.findFirst({
        where: {
          id: input.attemptId,
          userId: ctx.userId,
          status: { in: ["SUBMITTED", "ANALYZED"] },
        },
      });
      if (!attempt) {
        throw new TRPCError({
          code: "PRECONDITION_FAILED",
          message: "Attempt not submitted",
        });
      }

      await ctx.db.report.upsert({
        where: { attemptId: attempt.id },
        create: {
          attemptId: attempt.id,
          userId: ctx.userId,
          status: "PENDING",
        },
        update: {
          status: "PENDING",
          failureReason: null,
        },
      });

      if (ctx.emitEvent) {
        await ctx.emitEvent("attempt.submitted", {
          attemptId: attempt.id,
          userId: ctx.userId,
          testId: attempt.testId,
          force: true,
        });
      }

      return { ok: true as const, attemptId: attempt.id };
    }),
});
