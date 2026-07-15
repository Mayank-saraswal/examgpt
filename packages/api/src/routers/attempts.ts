import { TRPCError } from "@trpc/server";
import { z } from "zod";
import {
  checkAttemptOpen,
  computeEndsAt,
  derivePaletteFromEvents,
  scoreAttempt,
  type AttemptEventLike,
  type EventType,
  type MarkingScheme,
} from "@examgpt/ai";
import { createTRPCRouter, protectedProcedure } from "../trpc";

const eventTypeSchema = z.enum([
  "VISIT",
  "LEAVE",
  "SELECT",
  "CHANGE",
  "CLEAR",
  "MARK_REVIEW",
  "UNMARK_REVIEW",
  "SAVE_NEXT",
  "APP_BACKGROUND",
  "APP_FOREGROUND",
]);

const graceSec = () =>
  Number(process.env.ATTEMPT_GRACE_SEC ?? 5) || 5;

export const attemptsRouter = createTRPCRouter({
  /** Server-authoritative start: endsAt = now + durationMin */
  start: protectedProcedure
    .input(z.object({ testId: z.string().min(1) }))
    .mutation(async ({ ctx, input }) => {
      const test = await ctx.db.test.findFirst({
        where: {
          id: input.testId,
          deletedAt: null,
          status: "READY",
          OR: [
            { userId: ctx.userId, visibility: "PRIVATE" },
            {
              visibility: "PLATFORM",
              publishedAt: { not: null },
            },
          ],
        },
        include: { questions: { select: { id: true } } },
      });
      if (!test) {
        throw new TRPCError({
          code: "PRECONDITION_FAILED",
          message: "Test not READY",
        });
      }
      if (test.questions.length === 0) {
        throw new TRPCError({
          code: "PRECONDITION_FAILED",
          message: "Test has no questions",
        });
      }

      // Resume existing in-progress if any
      const existing = await ctx.db.attempt.findFirst({
        where: {
          testId: test.id,
          userId: ctx.userId,
          status: "IN_PROGRESS",
        },
      });
      if (existing) {
        const now = new Date();
        const open = checkAttemptOpen(existing.endsAt, now, graceSec());
        if (open.ok) {
          return {
            attemptId: existing.id,
            startedAt: existing.startedAt,
            endsAt: existing.endsAt,
            serverNow: now,
            resumed: true as const,
          };
        }
        // expired — force submit path left to cron; block new start
        throw new TRPCError({
          code: "PRECONDITION_FAILED",
          message: "Previous attempt expired — wait for auto-submit",
        });
      }

      const startedAt = new Date();
      const endsAt = computeEndsAt(startedAt, test.durationMin);
      const attempt = await ctx.db.attempt.create({
        data: {
          testId: test.id,
          userId: ctx.userId,
          status: "IN_PROGRESS",
          startedAt,
          endsAt,
        },
      });

      return {
        attemptId: attempt.id,
        startedAt: attempt.startedAt,
        endsAt: attempt.endsAt,
        serverNow: new Date(),
        resumed: false as const,
      };
    }),

  state: protectedProcedure
    .input(z.object({ attemptId: z.string().min(1) }))
    .query(async ({ ctx, input }) => {
      const attempt = await ctx.db.attempt.findFirst({
        where: { id: input.attemptId, userId: ctx.userId },
        include: {
          test: {
            include: {
              questions: {
                orderBy: { index: "asc" },
                select: {
                  index: true,
                  section: true,
                  text: true,
                  options: true,
                  imageKeys: true,
                  flagged: true,
                  // never send correctKey during exam
                },
              },
            },
          },
          events: { orderBy: { clientTs: "asc" } },
          responses: true,
        },
      });
      if (!attempt) throw new TRPCError({ code: "NOT_FOUND" });

      const now = new Date();
      const open = checkAttemptOpen(attempt.endsAt, now, graceSec());
      const indices = attempt.test.questions.map((q) => q.index);
      const events: AttemptEventLike[] = attempt.events.map((e) => ({
        questionIndex: e.questionIndex,
        type: e.type as EventType,
        optionKey: e.optionKey,
        clientTs: e.clientTs,
      }));
      const palette = derivePaletteFromEvents(events, indices);

      return {
        attempt: {
          id: attempt.id,
          status: attempt.status,
          startedAt: attempt.startedAt,
          endsAt: attempt.endsAt,
          submittedAt: attempt.submittedAt,
          score: attempt.score,
        },
        test: {
          id: attempt.test.id,
          title: attempt.test.title,
          durationMin: attempt.test.durationMin,
          markingScheme: attempt.test.markingScheme,
          questions: attempt.test.questions,
        },
        palette: Object.fromEntries(
          [...palette.entries()].map(([k, v]) => [k, v]),
        ),
        serverNow: now,
        remainingMs: open.remainingMs,
        open: open.ok && attempt.status === "IN_PROGRESS",
      };
    }),

  /** Restores answers, palette, remaining time (same payload as state). */
  resume: protectedProcedure
    .input(z.object({ attemptId: z.string().min(1) }))
    .query(async ({ ctx, input }) => {
      const attempt = await ctx.db.attempt.findFirst({
        where: { id: input.attemptId, userId: ctx.userId },
        include: {
          test: {
            include: {
              questions: {
                orderBy: { index: "asc" },
                select: {
                  index: true,
                  section: true,
                  text: true,
                  options: true,
                  imageKeys: true,
                  flagged: true,
                },
              },
            },
          },
          events: { orderBy: { clientTs: "asc" } },
        },
      });
      if (!attempt) throw new TRPCError({ code: "NOT_FOUND" });
      const now = new Date();
      const open = checkAttemptOpen(attempt.endsAt, now, graceSec());
      const indices = attempt.test.questions.map((q) => q.index);
      const events: AttemptEventLike[] = attempt.events.map((e) => ({
        questionIndex: e.questionIndex,
        type: e.type as EventType,
        optionKey: e.optionKey,
        clientTs: e.clientTs,
      }));
      const palette = derivePaletteFromEvents(events, indices);
      return {
        attempt: {
          id: attempt.id,
          status: attempt.status,
          startedAt: attempt.startedAt,
          endsAt: attempt.endsAt,
          submittedAt: attempt.submittedAt,
          score: attempt.score,
        },
        test: {
          id: attempt.test.id,
          title: attempt.test.title,
          durationMin: attempt.test.durationMin,
          markingScheme: attempt.test.markingScheme,
          questions: attempt.test.questions,
        },
        palette: Object.fromEntries(
          [...palette.entries()].map(([k, v]) => [k, v]),
        ),
        serverNow: now,
        remainingMs: open.remainingMs,
        open: open.ok && attempt.status === "IN_PROGRESS",
      };
    }),

  /**
   * Batch telemetry. Idempotent by batchId (skip if batch already stored).
   * Rejects after endsAt + grace; late events discarded and logged.
   */
  ingestEvents: protectedProcedure
    .input(
      z.object({
        attemptId: z.string().min(1),
        batchId: z.string().min(1).max(80),
        events: z
          .array(
            z.object({
              questionIndex: z.number().int().positive(),
              type: eventTypeSchema,
              optionKey: z.string().max(8).optional().nullable(),
              clientTs: z.coerce.date(),
            }),
          )
          .max(500),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const attempt = await ctx.db.attempt.findFirst({
        where: { id: input.attemptId, userId: ctx.userId },
      });
      if (!attempt) throw new TRPCError({ code: "NOT_FOUND" });

      const existing = await ctx.db.attemptEvent.findFirst({
        where: { attemptId: attempt.id, batchId: input.batchId },
      });
      if (existing) {
        return { ok: true as const, accepted: 0, deduped: true as const };
      }

      if (attempt.status !== "IN_PROGRESS") {
        console.warn(
          "[attempts] discard events on non-IN_PROGRESS",
          attempt.id,
        );
        return { ok: true as const, accepted: 0, discarded: true as const };
      }

      const now = new Date();
      const open = checkAttemptOpen(attempt.endsAt, now, graceSec());
      if (!open.ok) {
        console.warn(
          "[attempts] discard late events after endsAt+grace",
          attempt.id,
          input.batchId,
        );
        return {
          ok: true as const,
          accepted: 0,
          discarded: true as const,
          reason: "EXPIRED" as const,
        };
      }

      await ctx.db.attemptEvent.createMany({
        data: input.events.map((e) => ({
          attemptId: attempt.id,
          questionIndex: e.questionIndex,
          type: e.type,
          optionKey: e.optionKey ?? null,
          clientTs: e.clientTs,
          batchId: input.batchId,
        })),
      });

      return {
        ok: true as const,
        accepted: input.events.length,
        deduped: false as const,
        serverNow: now,
        remainingMs: open.remainingMs,
      };
    }),

  submit: protectedProcedure
    .input(
      z.object({
        attemptId: z.string().min(1),
        /** Client may request auto timeout flag; server still checks clock. */
        autoTimeout: z.boolean().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const attempt = await ctx.db.attempt.findFirst({
        where: { id: input.attemptId, userId: ctx.userId },
        include: {
          test: { include: { questions: true } },
          events: true,
        },
      });
      if (!attempt) throw new TRPCError({ code: "NOT_FOUND" });

      // Idempotent double-submit
      if (attempt.status !== "IN_PROGRESS") {
        return {
          ok: true as const,
          alreadySubmitted: true as const,
          attemptId: attempt.id,
          score: attempt.score,
          submittedAt: attempt.submittedAt,
        };
      }

      const now = new Date();
      const open = checkAttemptOpen(attempt.endsAt, now, graceSec());
      // Allow submit always if still IN_PROGRESS (including after grace for manual? 
      // Spec: reject submits after endsAt+grace except auto sweep)
      const isAuto = input.autoTimeout === true;
      if (!open.ok && !isAuto) {
        // still allow if within a longer window for client auto-submit race
        const hard = attempt.endsAt.getTime() + graceSec() * 1000 + 30_000;
        if (now.getTime() > hard) {
          throw new TRPCError({
            code: "PRECONDITION_FAILED",
            message: "Attempt window closed",
          });
        }
      }

      const scheme = attempt.test.markingScheme as MarkingScheme;
      const events: AttemptEventLike[] = attempt.events.map((e) => ({
        questionIndex: e.questionIndex,
        type: e.type as EventType,
        optionKey: e.optionKey,
        clientTs: e.clientTs,
      }));
      const scored = scoreAttempt({
        questions: attempt.test.questions.map((q) => ({
          index: q.index,
          correctKey: q.correctKey,
          flagged: q.flagged,
        })),
        events,
        scheme,
      });

      await ctx.db.$transaction(async (tx) => {
        await tx.response.deleteMany({ where: { attemptId: attempt.id } });
        for (const r of scored.responses) {
          await tx.response.create({
            data: {
              attemptId: attempt.id,
              questionIndex: r.questionIndex,
              selectedKey: r.selectedKey,
              paletteState: r.paletteState,
              timeSpentSec: r.timeSpentSec,
              visitCount: r.visitCount,
              optionChanges: r.optionChanges,
              isCorrect: r.isCorrect,
              marksAwarded: r.marksAwarded,
            },
          });
        }
        await tx.attempt.update({
          where: { id: attempt.id },
          data: {
            status: "SUBMITTED",
            submittedAt: now,
            submitType: isAuto || !open.ok ? "AUTO_TIMEOUT" : "MANUAL",
            score: scored.score,
          },
        });
      });

      if (ctx.emitEvent) {
        await ctx.emitEvent("attempt.submitted", {
          attemptId: attempt.id,
          userId: ctx.userId,
          testId: attempt.testId,
        });
      }

      return {
        ok: true as const,
        alreadySubmitted: false as const,
        attemptId: attempt.id,
        score: scored.score,
        maxScore: scored.maxScore,
        submittedAt: now,
      };
    }),

  /** Server clock for client offset resync */
  serverTime: protectedProcedure.query(() => {
    return { serverNow: new Date() };
  }),
});
