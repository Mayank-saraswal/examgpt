import { TRPCError } from "@trpc/server";
import type { Prisma } from "@examgpt/db";
import { setExamInput, fetchSyllabusUrlInput } from "@examgpt/validators";
import { createTRPCRouter, protectedProcedure } from "../trpc";
import { bundledSyllabus } from "../seed";

function bundledTopics(type: "NEET" | "JEE"): Prisma.InputJsonValue {
  return bundledSyllabus[type] as Prisma.InputJsonValue;
}

export const onboardingRouter = createTRPCRouter({
  setExam: protectedProcedure
    .input(setExamInput)
    .mutation(async ({ ctx, input }) => {
      // Ensure user row exists even if webhook lagging
      await ctx.db.user.upsert({
        where: { id: ctx.userId },
        create: { id: ctx.userId },
        update: {},
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
          syllabusStatus: isBundled ? "READY" : "PENDING",
          ...(topics !== undefined ? { syllabusTopics: topics } : {}),
        },
        update: {
          type: input.type,
          customName: input.type === "OTHER" ? input.customName : null,
          targetYear: input.targetYear,
          syllabusStatus: isBundled ? "READY" : "PENDING",
          ...(topics !== undefined ? { syllabusTopics: topics } : {}),
        },
      });

      // NEET/JEE: onboarding complete after exam select; OTHER waits for syllabus READY
      if (isBundled) {
        await ctx.db.user.update({
          where: { id: ctx.userId },
          data: { onboarded: true },
        });
      }

      return exam;
    }),

  /**
   * Register a syllabus fetched from a public URL (Other exam path).
   * Actual fetch + OCR/topic extraction runs in Inngest `syllabus/ingest`.
   */
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
      exam: user?.exam ?? null,
    };
  }),
});
