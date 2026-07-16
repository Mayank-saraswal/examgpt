import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { createTRPCRouter, protectedProcedure } from "../trpc";
import { computeStudyStreak } from "../streak";

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
   * Dashboard aggregates: score trend, weak topics, recommended next,
   * study streak (IST), checklist, recent docs/chats, platform papers.
   */
  dashboard: protectedProcedure.query(async ({ ctx }) => {
    const userId = ctx.userId;
    const user = await ctx.db.user.findUnique({
      where: { id: userId },
      include: { exam: true },
    });

    const reports = await ctx.db.report.findMany({
      where: { userId, status: "READY" },
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

    // Activity for streak
    const [messages, docs, attempts] = await Promise.all([
      ctx.db.message.findMany({
        where: { chat: { userId }, role: "USER" },
        select: { createdAt: true },
        take: 500,
        orderBy: { createdAt: "desc" },
      }),
      ctx.db.document.findMany({
        where: { userId, deletedAt: null },
        select: { createdAt: true },
        take: 200,
        orderBy: { createdAt: "desc" },
      }),
      ctx.db.attempt.findMany({
        where: { userId, submittedAt: { not: null } },
        select: { submittedAt: true },
        take: 200,
        orderBy: { submittedAt: "desc" },
      }),
    ]);

    const activity: Date[] = [
      ...messages.map((m) => m.createdAt),
      ...docs.map((d) => d.createdAt),
      ...attempts
        .map((a) => a.submittedAt)
        .filter((d): d is Date => d != null),
    ];
    const studyStreak = computeStudyStreak(activity);

    const docCount = await ctx.db.document.count({
      where: { userId, deletedAt: null, kind: { not: "SYLLABUS" } },
    });
    const chatCount = await ctx.db.chat.count({
      where: { userId, deletedAt: null },
    });
    const attemptCount = await ctx.db.attempt.count({
      where: { userId, status: { not: "IN_PROGRESS" } },
    });

    const checklist = {
      uploadNotes: docCount > 0,
      askTutor: chatCount > 0,
      takePaper: attemptCount > 0,
    };
    const isNewUser =
      !checklist.uploadNotes && !checklist.askTutor && !checklist.takePaper;

    const recentDocuments = await ctx.db.document.findMany({
      where: { userId, deletedAt: null },
      orderBy: { updatedAt: "desc" },
      take: 5,
      select: {
        id: true,
        title: true,
        kind: true,
        ingestStatus: true,
        ingestProgress: true,
        updatedAt: true,
      },
    });

    const recentChats = await ctx.db.chat.findMany({
      where: { userId, deletedAt: null },
      orderBy: { updatedAt: "desc" },
      take: 5,
      select: {
        id: true,
        title: true,
        updatedAt: true,
      },
    });

    const examType = user?.exam?.type ?? null;
    const platformPapers = examType
      ? await ctx.db.test.findMany({
          where: {
            visibility: "PLATFORM",
            deletedAt: null,
            status: "READY",
            publishedAt: { not: null },
            examType,
          },
          orderBy: [{ paperYear: "desc" }, { title: "asc" }],
          take: 5,
          select: {
            id: true,
            title: true,
            paperYear: true,
            examType: true,
            durationMin: true,
            _count: { select: { questions: true } },
          },
        })
      : [];

    // Days to exam: May 1 of targetYear (NEET/JEE typical) or Jan 1
    let daysToExam: number | null = null;
    if (user?.exam?.targetYear) {
      const y = user.exam.targetYear;
      const examDate = new Date(Date.UTC(y, 4, 1)); // May 1
      const now = new Date();
      daysToExam = Math.ceil(
        (examDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24),
      );
    }

    return {
      scoreTrend,
      weakTopics: [...weakMap.keys()].slice(0, 10),
      recommendedNext,
      latestReportId: latest?.id ?? null,
      latestAttemptId: latest?.attemptId ?? null,
      studyStreak,
      checklist,
      isNewUser,
      recentDocuments,
      recentChats,
      platformPapers,
      daysToExam,
      examType,
      targetYear: user?.exam?.targetYear ?? null,
      targetScore: user?.exam?.targetScore ?? null,
      firstName: user?.name?.split(/\s+/)[0] ?? null,
      onboarded: user?.onboarded ?? false,
    };
  }),

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
          force: true,
        });
      }
      return { ok: true as const };
    }),
});
