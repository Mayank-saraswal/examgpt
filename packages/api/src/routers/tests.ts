import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { NEET_MARKING, JEE_MARKING } from "@examgpt/ai";
import { createTRPCRouter, protectedProcedure } from "../trpc";

const markingDefault = (exam?: string) =>
  exam === "JEE" ? JEE_MARKING : NEET_MARKING;

export const testsRouter = createTRPCRouter({
  list: protectedProcedure.query(async ({ ctx }) => {
    return ctx.db.test.findMany({
      where: { userId: ctx.userId, deletedAt: null },
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        title: true,
        source: true,
        status: true,
        durationMin: true,
        totalMarks: true,
        syllabusMatchScore: true,
        failureReason: true,
        createdAt: true,
        updatedAt: true,
        _count: { select: { questions: true, attempts: true } },
      },
    });
  }),

  get: protectedProcedure
    .input(z.object({ id: z.string().min(1) }))
    .query(async ({ ctx, input }) => {
      const test = await ctx.db.test.findFirst({
        where: { id: input.id, userId: ctx.userId, deletedAt: null },
        include: {
          questions: { orderBy: { index: "asc" } },
        },
      });
      if (!test) throw new TRPCError({ code: "NOT_FOUND" });
      return test;
    }),

  /**
   * Create a PYQ test from an already-uploaded PAPER document (or register path).
   * Kicks off paper/extract via emitEvent.
   */
  createFromPaper: protectedProcedure
    .input(
      z.object({
        documentId: z.string().min(1),
        title: z.string().min(1).max(200).optional(),
        durationMin: z.number().int().min(1).max(600).optional(),
        paperYear: z.number().int().optional(),
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
      if (!doc) throw new TRPCError({ code: "NOT_FOUND", message: "Document not found" });

      await ctx.db.user.upsert({
        where: { id: ctx.userId },
        create: { id: ctx.userId },
        update: {},
      });

      const exam = await ctx.db.examProfile.findUnique({
        where: { userId: ctx.userId },
      });
      const scheme = markingDefault(exam?.type);

      const test = await ctx.db.test.create({
        data: {
          userId: ctx.userId,
          source: "PYQ_UPLOAD",
          title: input.title ?? doc.title,
          paperDocumentId: doc.id,
          paperYear: input.paperYear,
          durationMin: input.durationMin ?? 180,
          totalMarks: 0,
          markingScheme: scheme,
          status: "EXTRACTING",
        },
      });

      // Ensure document kind is PAPER
      if (doc.kind !== "PAPER") {
        await ctx.db.document.update({
          where: { id: doc.id },
          data: { kind: "PAPER" },
        });
      }

      if (ctx.emitEvent) {
        await ctx.emitEvent("test.paper_uploaded", {
          testId: test.id,
          documentId: doc.id,
          userId: ctx.userId,
        });
      }

      return test;
    }),

  /**
   * AI-generated paper config UI (Phase 6 backend). Flagged behind ready=false.
   */
  createGenerated: protectedProcedure
    .input(
      z.object({
        title: z.string().min(1).max(200),
        durationMin: z.number().int().min(15).max(600).default(180),
        questionCount: z.number().int().min(5).max(200).default(45),
        topics: z.array(z.string()).optional(),
        difficulty: z.enum(["easy", "medium", "hard", "mixed"]).default("mixed"),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      // Phase 6 — create placeholder GENERATING test
      const exam = await ctx.db.examProfile.findUnique({
        where: { userId: ctx.userId },
      });
      const test = await ctx.db.test.create({
        data: {
          userId: ctx.userId,
          source: "AI_GENERATED",
          title: input.title,
          durationMin: input.durationMin,
          totalMarks: 0,
          markingScheme: markingDefault(exam?.type),
          status: "GENERATING",
          config: {
            questionCount: input.questionCount,
            topics: input.topics ?? [],
            difficulty: input.difficulty,
            phase6: true,
          },
          failureReason:
            "AI paper generation ships in Phase 6. Config saved; use PYQ upload for now.",
        },
      });
      return test;
    }),

  confirmMismatchedPaper: protectedProcedure
    .input(
      z.object({
        id: z.string().min(1),
        continueAnyway: z.boolean(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const test = await ctx.db.test.findFirst({
        where: {
          id: input.id,
          userId: ctx.userId,
          deletedAt: null,
          status: "NEEDS_REVIEW",
        },
      });
      if (!test) throw new TRPCError({ code: "NOT_FOUND" });

      if (!input.continueAnyway) {
        await ctx.db.test.update({
          where: { id: test.id },
          data: {
            status: "FAILED",
            failureReason: "User rejected mismatched paper",
            deletedAt: new Date(),
          },
        });
        return { ok: true as const, status: "FAILED" as const };
      }

      // Continue extraction (resume pipeline)
      await ctx.db.test.update({
        where: { id: test.id },
        data: { status: "EXTRACTING", failureReason: null },
      });
      if (ctx.emitEvent && test.paperDocumentId) {
        await ctx.emitEvent("test.paper_uploaded", {
          testId: test.id,
          documentId: test.paperDocumentId,
          userId: ctx.userId,
          forceContinue: true,
        });
      }
      return { ok: true as const, status: "EXTRACTING" as const };
    }),

  reviewQuestions: protectedProcedure
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
        where: { id: input.testId, userId: ctx.userId, deletedAt: null },
      });
      if (!test) throw new TRPCError({ code: "NOT_FOUND" });

      for (const f of input.flags) {
        await ctx.db.question.updateMany({
          where: { testId: test.id, index: f.questionIndex },
          data: { flagged: f.flagged },
        });
      }

      // Do not auto-promote status here; finishReview explicitly sets READY.

      return { ok: true as const };
    }),

  /** Mark review complete → READY (after user checked flagged Qs). */
  finishReview: protectedProcedure
    .input(z.object({ testId: z.string().min(1) }))
    .mutation(async ({ ctx, input }) => {
      const test = await ctx.db.test.findFirst({
        where: { id: input.testId, userId: ctx.userId, deletedAt: null },
      });
      if (!test) throw new TRPCError({ code: "NOT_FOUND" });
      const qCount = await ctx.db.question.count({ where: { testId: test.id } });
      if (qCount === 0) {
        throw new TRPCError({
          code: "PRECONDITION_FAILED",
          message: "No questions extracted yet",
        });
      }
      const updated = await ctx.db.test.update({
        where: { id: test.id },
        data: { status: "READY", failureReason: null },
      });
      return updated;
    }),

  retryExtraction: protectedProcedure
    .input(z.object({ id: z.string().min(1) }))
    .mutation(async ({ ctx, input }) => {
      const test = await ctx.db.test.findFirst({
        where: { id: input.id, userId: ctx.userId, deletedAt: null },
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
          syllabusMatchScore: null,
        },
      });
      if (ctx.emitEvent) {
        await ctx.emitEvent("test.paper_uploaded", {
          testId: test.id,
          documentId: test.paperDocumentId,
          userId: ctx.userId,
          forceContinue: true,
        });
      }
      return { ok: true as const };
    }),

  delete: protectedProcedure
    .input(z.object({ id: z.string().min(1) }))
    .mutation(async ({ ctx, input }) => {
      const test = await ctx.db.test.findFirst({
        where: { id: input.id, userId: ctx.userId, deletedAt: null },
      });
      if (!test) throw new TRPCError({ code: "NOT_FOUND" });
      await ctx.db.test.update({
        where: { id: test.id },
        data: { deletedAt: new Date() },
      });
      return { ok: true as const };
    }),
});
