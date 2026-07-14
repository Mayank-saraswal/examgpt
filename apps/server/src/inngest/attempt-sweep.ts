import {
  checkAttemptOpen,
  scoreAttempt,
  type AttemptEventLike,
  type EventType,
  type MarkingScheme,
} from "@examgpt/ai";
import { db } from "@examgpt/db";
import { inngest } from "./client";
import { logger } from "../logger";
import { env } from "../env";

/**
 * Cron: force-submit expired IN_PROGRESS attempts (app kill / background).
 */
export const attemptTimeoutSweep = inngest.createFunction(
  { id: "attempt-timeout-sweep", retries: 1 },
  { cron: "*/2 * * * *" },
  async ({ step }) => {
    const now = new Date();
    const grace = env.ATTEMPT_GRACE_SEC;

    const expired = await step.run("find-expired", async () => {
      return db.attempt.findMany({
        where: {
          status: "IN_PROGRESS",
          endsAt: { lt: new Date(now.getTime() - grace * 1000) },
        },
        take: 50,
        include: {
          test: { include: { questions: true } },
          events: true,
        },
      });
    });

    let submitted = 0;
    for (const attempt of expired) {
      await step.run(`force-submit-${attempt.id}`, async () => {
        const open = checkAttemptOpen(
          new Date(attempt.endsAt),
          new Date(),
          grace,
        );
        if (open.ok) return;

        const fresh = await db.attempt.findUnique({
          where: { id: attempt.id },
        });
        if (!fresh || fresh.status !== "IN_PROGRESS") return;

        const events: AttemptEventLike[] = attempt.events.map((e) => ({
          questionIndex: e.questionIndex,
          type: e.type as EventType,
          optionKey: e.optionKey,
          clientTs: e.clientTs,
        }));
        const scheme = attempt.test.markingScheme as MarkingScheme;
        const scored = scoreAttempt({
          questions: attempt.test.questions.map((q) => ({
            index: q.index,
            correctKey: q.correctKey,
            flagged: q.flagged,
          })),
          events,
          scheme,
        });

        await db.$transaction(async (tx) => {
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
              submittedAt: new Date(),
              submitType: "AUTO_TIMEOUT",
              score: scored.score,
            },
          });
        });

        logger.info({ attemptId: attempt.id }, "auto-submitted expired attempt");
        submitted += 1;

        await inngest.send({
          name: "attempt.submitted",
          data: {
            attemptId: attempt.id,
            userId: attempt.userId,
            testId: attempt.testId,
            auto: true,
          },
        });
      });
    }

    return { scanned: expired.length, submitted };
  },
);
