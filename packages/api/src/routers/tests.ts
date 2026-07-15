import { TRPCError } from "@trpc/server";
import { z } from "zod";
import {
  NEET_MARKING,
  JEE_MARKING,
  flattenSyllabusTopics,
} from "@examgpt/ai";
import { createTRPCRouter, protectedProcedure } from "../trpc";
import { bundledSyllabus } from "../seed";

const markingDefault = (exam?: string) =>
  exam === "JEE" ? JEE_MARKING : NEET_MARKING;

export const testsRouter = createTRPCRouter({
  list: protectedProcedure.query(async ({ ctx }) => {
    return ctx.db.test.findMany({
      where: {
        userId: ctx.userId,
        visibility: "PRIVATE",
        deletedAt: null,
      },
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

  /**
   * Published platform PYQs filtered by the user's exam profile (NEET user → NEET papers).
   */
  listPlatformPapers: protectedProcedure.query(async ({ ctx }) => {
    const exam = await ctx.db.examProfile.findUnique({
      where: { userId: ctx.userId },
    });
    const examType = exam?.type ?? null;
    return ctx.db.test.findMany({
      where: {
        visibility: "PLATFORM",
        deletedAt: null,
        status: "READY",
        publishedAt: { not: null },
        ...(examType ? { examType } : {}),
      },
      orderBy: [{ paperYear: "desc" }, { title: "asc" }],
      select: {
        id: true,
        title: true,
        examType: true,
        paperYear: true,
        durationMin: true,
        totalMarks: true,
        publishedAt: true,
        _count: { select: { questions: true } },
      },
    });
  }),

  get: protectedProcedure
    .input(z.object({ id: z.string().min(1) }))
    .query(async ({ ctx, input }) => {
      const test = await ctx.db.test.findFirst({
        where: {
          id: input.id,
          deletedAt: null,
          OR: [
            { userId: ctx.userId, visibility: "PRIVATE" },
            {
              visibility: "PLATFORM",
              status: "READY",
              publishedAt: { not: null },
            },
          ],
        },
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
          visibility: "PRIVATE",
          source: "PYQ_UPLOAD",
          title: input.title ?? doc.title,
          paperDocumentId: doc.id,
          examType: exam?.type ?? null,
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
   * Topics available for AI paper config (syllabus tree + recent weak topics).
   */
  generationTopics: protectedProcedure.query(async ({ ctx }) => {
    const exam = await ctx.db.examProfile.findUnique({
      where: { userId: ctx.userId },
    });
    let syllabus = flattenSyllabusTopics(exam?.syllabusTopics);
    if (syllabus.length === 0 && exam?.type) {
      if (exam.type === "NEET" || exam.type === "JEE") {
        syllabus = flattenSyllabusTopics(
          exam.type === "JEE" ? bundledSyllabus.JEE : bundledSyllabus.NEET,
        );
      }
    }
    const reports = await ctx.db.report.findMany({
      where: { userId: ctx.userId, status: "READY" },
      orderBy: { createdAt: "desc" },
      take: 3,
      select: { topicAnalysis: true },
    });
    const weak: string[] = [];
    for (const r of reports) {
      const rows = r.topicAnalysis as { topic: string; verdict: string }[] | null;
      if (!Array.isArray(rows)) continue;
      for (const row of rows) {
        if (row.verdict === "WEAK" && !weak.includes(row.topic)) {
          weak.push(row.topic);
        }
      }
    }
    return {
      examType: exam?.type ?? null,
      syllabusTopics: syllabus,
      weakTopics: weak,
    };
  }),

  /**
   * Create AI-generated paper and kick off paper/generate Inngest job.
   */
  createGenerated: protectedProcedure
    .input(
      z.object({
        title: z.string().min(1).max(200),
        durationMin: z.number().int().min(15).max(600).default(180),
        questionCount: z.number().int().min(5).max(100).default(20),
        /** Empty / omitted + mode auto → weak-topic weighting */
        topics: z.array(z.string()).max(40).optional(),
        difficulty: z
          .enum(["easy", "medium", "hard", "mixed"])
          .default("mixed"),
        mode: z.enum(["auto", "manual"]).default("auto"),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      await ctx.db.user.upsert({
        where: { id: ctx.userId },
        create: { id: ctx.userId },
        update: {},
      });
      const exam = await ctx.db.examProfile.findUnique({
        where: { userId: ctx.userId },
      });
      const mode =
        input.mode === "manual" && (input.topics?.length ?? 0) > 0
          ? "manual"
          : "auto";
      const test = await ctx.db.test.create({
        data: {
          userId: ctx.userId,
          visibility: "PRIVATE",
          source: "AI_GENERATED",
          title: input.title,
          examType: exam?.type ?? null,
          durationMin: input.durationMin,
          totalMarks: 0,
          markingScheme: markingDefault(exam?.type),
          status: "GENERATING",
          config: {
            questionCount: input.questionCount,
            topics: input.topics ?? [],
            difficulty: input.difficulty,
            mode,
            phase6: true,
          },
          failureReason: null,
        },
      });

      if (ctx.emitEvent) {
        await ctx.emitEvent("test.generate_requested", {
          testId: test.id,
          userId: ctx.userId,
        });
      }

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
