import { TRPCError } from "@trpc/server";
import type { Prisma } from "@examgpt/db";
import {
  setExamInput,
  fetchSyllabusUrlInput,
  saveOnboardingProgressInput,
} from "@examgpt/validators";
import { createTRPCRouter, protectedProcedure } from "../trpc";
import { bundledSyllabus } from "../seed";

function bundledTopics(type: "NEET" | "JEE"): Prisma.InputJsonValue {
  return bundledSyllabus[type] as Prisma.InputJsonValue;
}

export const onboardingRouter = createTRPCRouter({
  /**
   * Persist wizard progress. Resumable across sessions.
   * Does not mark onboarded until `complete`.
   */
  saveProgress: protectedProcedure
    .input(saveOnboardingProgressInput)
    .mutation(async ({ ctx, input }) => {
      await ctx.db.user.upsert({
        where: { id: ctx.userId },
        create: {
          id: ctx.userId,
          name: input.name,
          age: input.age,
          onboardingStep: input.step,
        },
        update: {
          ...(input.name !== undefined ? { name: input.name } : {}),
          ...(input.age !== undefined ? { age: input.age } : {}),
          onboardingStep: input.step === "done" ? "done" : input.step,
        },
      });

      if (input.examType) {
        const isBundled = input.examType === "NEET" || input.examType === "JEE";
        const topics: Prisma.InputJsonValue | undefined = isBundled
          ? bundledTopics(input.examType === "JEE" ? "JEE" : "NEET")
          : undefined;

        await ctx.db.examProfile.upsert({
          where: { userId: ctx.userId },
          create: {
            userId: ctx.userId,
            type: input.examType,
            customName:
              input.examType === "OTHER" ? input.customName ?? null : null,
            targetYear: input.targetYear ?? null,
            targetScore: input.targetScore ?? null,
            syllabusStatus: isBundled ? "READY" : "PENDING",
            ...(topics !== undefined ? { syllabusTopics: topics } : {}),
          },
          update: {
            type: input.examType,
            customName:
              input.examType === "OTHER" ? input.customName ?? null : null,
            ...(input.targetYear !== undefined
              ? { targetYear: input.targetYear }
              : {}),
            ...(input.targetScore !== undefined
              ? { targetScore: input.targetScore }
              : {}),
            ...(isBundled
              ? { syllabusStatus: "READY", syllabusTopics: topics }
              : {}),
          },
        });

        if (
          input.examType === "OTHER" &&
          input.syllabusUrl?.trim()
        ) {
          const exam = await ctx.db.examProfile.findUnique({
            where: { userId: ctx.userId },
          });
          if (exam) {
            const doc = await ctx.db.document.create({
              data: {
                userId: ctx.userId,
                kind: "SYLLABUS",
                title: input.syllabusTitle ?? input.customName ?? "Syllabus",
                sourceType: "URL",
                sourceUrl: input.syllabusUrl.trim(),
                ingestStatus: "PENDING",
              },
            });
            await ctx.db.examProfile.update({
              where: { userId: ctx.userId },
              data: {
                syllabusDocumentId: doc.id,
                syllabusStatus: "PENDING",
              },
            });
            if (ctx.emitEvent) {
              await ctx.emitEvent("syllabus/uploaded", {
                documentId: doc.id,
                userId: ctx.userId,
              });
            }
          }
        }
      } else if (
        input.targetYear !== undefined ||
        input.targetScore !== undefined
      ) {
        await ctx.db.examProfile.updateMany({
          where: { userId: ctx.userId },
          data: {
            ...(input.targetYear !== undefined
              ? { targetYear: input.targetYear }
              : {}),
            ...(input.targetScore !== undefined
              ? { targetScore: input.targetScore }
              : {}),
          },
        });
      }

      return ctx.db.user.findUnique({
        where: { id: ctx.userId },
        include: { exam: true },
      });
    }),

  /** Mark onboarding finished (exam choice required). */
  complete: protectedProcedure.mutation(async ({ ctx }) => {
    const user = await ctx.db.user.findUnique({
      where: { id: ctx.userId },
      include: { exam: true },
    });
    if (!user?.exam) {
      throw new TRPCError({
        code: "PRECONDITION_FAILED",
        message: "Choose an exam before finishing onboarding",
      });
    }
    return ctx.db.user.update({
      where: { id: ctx.userId },
      data: { onboarded: true, onboardingStep: "done" },
      include: { exam: true },
    });
  }),

  setExam: protectedProcedure
    .input(setExamInput)
    .mutation(async ({ ctx, input }) => {
      await ctx.db.user.upsert({
        where: { id: ctx.userId },
        create: { id: ctx.userId, onboardingStep: "exam" },
        update: { onboardingStep: "targets" },
      });

      const isBundled = input.type === "NEET" || input.type === "JEE";
      const topics: Prisma.InputJsonValue | undefined = isBundled
        ? bundledTopics(input.type === "JEE" ? "JEE" : "NEET")
        : undefined;

      const exam = await ctx.db.examProfile.upsert({
        where: { userId: ctx.userId },
        create: {
          userId: ctx.userId,
          type: input.type,
          customName: input.type === "OTHER" ? input.customName : null,
          targetYear: input.targetYear,
          targetScore: input.targetScore ?? null,
          syllabusStatus: isBundled ? "READY" : "PENDING",
          ...(topics !== undefined ? { syllabusTopics: topics } : {}),
        },
        update: {
          type: input.type,
          customName: input.type === "OTHER" ? input.customName : null,
          targetYear: input.targetYear,
          ...(input.targetScore !== undefined
            ? { targetScore: input.targetScore }
            : {}),
          syllabusStatus: isBundled ? "READY" : "PENDING",
          ...(topics !== undefined ? { syllabusTopics: topics } : {}),
        },
      });

      // Do NOT set onboarded here — wizard must complete via `complete`.
      return exam;
    }),

  fetchSyllabusFromUrl: protectedProcedure
    .input(fetchSyllabusUrlInput)
    .mutation(async ({ ctx, input }) => {
      const exam = await ctx.db.examProfile.findUnique({
        where: { userId: ctx.userId },
      });
      if (!exam || exam.type !== "OTHER") {
        throw new TRPCError({
          code: "PRECONDITION_FAILED",
          message: "Set exam type to OTHER before uploading a custom syllabus",
        });
      }

      const doc = await ctx.db.document.create({
        data: {
          userId: ctx.userId,
          kind: "SYLLABUS",
          title: input.title,
          sourceType: "URL",
          sourceUrl: input.url,
          ingestStatus: "PENDING",
        },
      });

      await ctx.db.examProfile.update({
        where: { userId: ctx.userId },
        data: {
          syllabusDocumentId: doc.id,
          syllabusStatus: "PENDING",
        },
      });

      if (ctx.emitEvent) {
        await ctx.emitEvent("syllabus/uploaded", {
          documentId: doc.id,
          userId: ctx.userId,
        });
      }

      return { documentId: doc.id, status: "PENDING" as const };
    }),

  status: protectedProcedure.query(async ({ ctx }) => {
    const user = await ctx.db.user.findUnique({
      where: { id: ctx.userId },
      include: { exam: true },
    });
    return {
      onboarded: user?.onboarded ?? false,
      step: user?.onboardingStep ?? "profile",
      name: user?.name ?? null,
      age: user?.age ?? null,
      exam: user?.exam ?? null,
    };
  }),
});
