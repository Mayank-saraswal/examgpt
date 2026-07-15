import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { NEET_MARKING, JEE_MARKING } from "@examgpt/ai";
import { createTRPCRouter, adminProcedure } from "../trpc";

const examTypeSchema = z.enum(["NEET", "JEE", "OTHER"]);

const markingFor = (exam: "NEET" | "JEE" | "OTHER") =>
  exam === "JEE" ? JEE_MARKING : NEET_MARKING;

/**
 * Platform PYQ admin surface. All procedures require adminProcedure dual-gate.
 */
export const adminRouter = createTRPCRouter({
  me: adminProcedure.query(async ({ ctx }) => {
    return { userId: ctx.userId, role: ctx.role };
  }),

  /**
   * Create a PLATFORM test from an already-uploaded PAPER document (admin-owned).
   * Runs the same paper/extract pipeline as user PYQs.
   */
  createPlatformPaper: adminProcedure
    .input(
      z.object({
        documentId: z.string().min(1),
        title: z.string().min(1).max(200),
        examType: examTypeSchema,
        paperYear: z.number().int().min(1990).max(2100),
        durationMin: z.number().int().min(1).max(600).default(180),
        contentHash: z.string().min(8).max(128).optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const doc = await ctx.db.document.findFirst({
        where: {
          id: input.documentId,
          userId: ctx.userId,
          deletedAt: null,
        },
      });
      if (!doc) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Document not found",
        });
      }

      // Dedupe guard: same contentHash on another platform paper
      if (input.contentHash) {
        const existing = await ctx.db.test.findFirst({
          where: {
            visibility: "PLATFORM",
            contentHash: input.contentHash,
            deletedAt: null,
          },
          select: {
            id: true,
            title: true,
            paperYear: true,
            examType: true,
            status: true,
            publishedAt: true,
          },
        });
        if (existing) {
          return {
            test: null,
            dedupeWarning: {
              existingTestId: existing.id,
              title: existing.title,
              paperYear: existing.paperYear,
              examType: existing.examType,
              status: existing.status,
              publishedAt: existing.publishedAt,
            },
          };
        }
      }

      if (doc.kind !== "PAPER") {
        await ctx.db.document.update({
          where: { id: doc.id },
          data: { kind: "PAPER" },
        });
      }
      if (input.contentHash && !doc.contentHash) {
        await ctx.db.document.update({
          where: { id: doc.id },
          data: { contentHash: input.contentHash },
        });
      }

      const test = await ctx.db.test.create({
        data: {
          userId: null,
          visibility: "PLATFORM",
          source: "PYQ_UPLOAD",
          title: input.title,
          paperDocumentId: doc.id,
          examType: input.examType,
          paperYear: input.paperYear,
          contentHash: input.contentHash ?? doc.contentHash,
          durationMin: input.durationMin,
          totalMarks: 0,
          markingScheme: markingFor(input.examType),
          status: "EXTRACTING",
          publishedAt: null,
        },
      });

      if (ctx.emitEvent) {
        await ctx.emitEvent("test.paper_uploaded", {
          testId: test.id,
          documentId: doc.id,
          userId: ctx.userId,
          platform: true,
        });
      }

      return { test, dedupeWarning: null };
    }),

  listPlatformPapers: adminProcedure
    .input(
      z
        .object({
          limit: z.number().int().min(1).max(100).default(50),
        })
        .optional(),
    )
    .query(async ({ ctx, input }) => {
      const limit = input?.limit ?? 50;
      return ctx.db.test.findMany({
        where: { visibility: "PLATFORM", deletedAt: null },
        orderBy: [{ paperYear: "desc" }, { createdAt: "desc" }],
        take: limit,
        select: {
          id: true,
          title: true,
          examType: true,
          paperYear: true,
          status: true,
          publishedAt: true,
          contentHash: true,
          durationMin: true,
          totalMarks: true,
          failureReason: true,
          createdAt: true,
          updatedAt: true,
          _count: { select: { questions: true, attempts: true } },
        },
      });
    }),

  setPublished: adminProcedure
    .input(
      z.object({
        testId: z.string().min(1),
        published: z.boolean(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const test = await ctx.db.test.findFirst({
        where: {
          id: input.testId,
          visibility: "PLATFORM",
          deletedAt: null,
        },
      });
      if (!test) throw new TRPCError({ code: "NOT_FOUND" });
      if (input.published && test.status !== "READY") {
        throw new TRPCError({
          code: "PRECONDITION_FAILED",
          message: "Only READY papers can be published",
        });
      }
      return ctx.db.test.update({
        where: { id: test.id },
        data: {
          publishedAt: input.published ? new Date() : null,
        },
      });
    }),

  /** Reuse extraction review for platform papers (admin owns pipeline). */
  getPlatformPaper: adminProcedure
    .input(z.object({ testId: z.string().min(1) }))
    .query(async ({ ctx, input }) => {
      const test = await ctx.db.test.findFirst({
        where: {
          id: input.testId,
          visibility: "PLATFORM",
          deletedAt: null,
        },
        include: {
          questions: { orderBy: { index: "asc" } },
        },
      });
      if (!test) throw new TRPCError({ code: "NOT_FOUND" });
      return test;
    }),

  reviewPlatformQuestions: adminProcedure
    .input(
      z.object({
        testId: z.string().min(1),
        flags: z
          .array(
            z.object({
              questionIndex: z.number().int().positive(),
              flagged: z.boolean(),
            }),
          )
          .max(500),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const test = await ctx.db.test.findFirst({
        where: {
          id: input.testId,
          visibility: "PLATFORM",
          deletedAt: null,
        },
      });
      if (!test) throw new TRPCError({ code: "NOT_FOUND" });
      for (const f of input.flags) {
        await ctx.db.question.updateMany({
          where: { testId: test.id, index: f.questionIndex },
          data: { flagged: f.flagged },
        });
      }
      return { ok: true as const };
    }),

  finishPlatformReview: adminProcedure
    .input(z.object({ testId: z.string().min(1) }))
    .mutation(async ({ ctx, input }) => {
      const test = await ctx.db.test.findFirst({
        where: {
          id: input.testId,
          visibility: "PLATFORM",
          deletedAt: null,
        },
      });
      if (!test) throw new TRPCError({ code: "NOT_FOUND" });
      const qCount = await ctx.db.question.count({ where: { testId: test.id } });
      if (qCount === 0) {
        throw new TRPCError({
          code: "PRECONDITION_FAILED",
          message: "No questions extracted yet",
        });
      }
      return ctx.db.test.update({
        where: { id: test.id },
        data: { status: "READY", failureReason: null },
      });
    }),

  retryPlatformExtraction: adminProcedure
    .input(z.object({ testId: z.string().min(1) }))
    .mutation(async ({ ctx, input }) => {
      const test = await ctx.db.test.findFirst({
        where: {
          id: input.testId,
          visibility: "PLATFORM",
          deletedAt: null,
        },
      });
      if (!test?.paperDocumentId) {
        throw new TRPCError({ code: "NOT_FOUND" });
      }
      await ctx.db.question.deleteMany({ where: { testId: test.id } });
      await ctx.db.test.update({
        where: { id: test.id },
        data: {
          status: "EXTRACTING",
          failureReason: null,
          publishedAt: null,
          syllabusMatchScore: null,
        },
      });
      if (ctx.emitEvent) {
        await ctx.emitEvent("test.paper_uploaded", {
          testId: test.id,
          documentId: test.paperDocumentId,
          userId: ctx.userId,
          platform: true,
          forceContinue: true,
        });
      }
      return { ok: true as const };
    }),

  /**
   * Global AiUsageLog summary (admin) + report cost rollups.
   */
  usageSummary: adminProcedure
    .input(
      z
        .object({
          days: z.number().int().min(1).max(90).default(30),
        })
        .optional(),
    )
    .query(async ({ ctx, input }) => {
      const days = input?.days ?? 30;
      const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
      const rows = await ctx.db.aiUsageLog.groupBy({
        by: ["task", "model"],
        where: { createdAt: { gte: since } },
        _sum: { tokensIn: true, tokensOut: true, costUsd: true },
        _count: true,
        _avg: { latencyMs: true },
      });
      const totals = await ctx.db.aiUsageLog.aggregate({
        where: { createdAt: { gte: since } },
        _sum: { tokensIn: true, tokensOut: true, costUsd: true },
        _count: true,
      });
      const reportCosts = await ctx.db.report.aggregate({
        where: { createdAt: { gte: since }, totalCostUsd: { not: null } },
        _sum: { totalCostUsd: true },
        _avg: { totalCostUsd: true },
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
        reports: {
          count: reportCosts._count,
          totalCostUsd: reportCosts._sum.totalCostUsd ?? 0,
          avgCostUsd: reportCosts._avg.totalCostUsd ?? 0,
        },
      };
    }),
});
