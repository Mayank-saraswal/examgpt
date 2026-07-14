import {
  addMemory,
  buildQuestionAnalysisRows,
  buildTimeAnalysis,
  buildTopicAnalysis,
  crossCheckCorrectKey,
  explainQuestion,
  generateReportNarrative,
  optionTrailFromEvents,
  rankWeakTopicsForGap,
  researchExamCutoff,
  scoreAttempt,
  type AttemptEventLike,
  type EventType,
  type MarkingScheme,
  type QuestionAnalysisInput,
  type QuestionAnalysisRow,
} from "@examgpt/ai";
import { db } from "@examgpt/db";
import type { Prisma } from "@prisma/client";
import { inngest } from "./client";
import { logger } from "../logger";
import { hybridSearchStudyChunks } from "../qdrant/search";
import { sendPushToUser } from "../push";

/**
 * attempt/analyze — post-submit report pipeline (Phase 5).
 * Idempotent: READY report short-circuits unless force=true.
 */
export const attemptAnalyze = inngest.createFunction(
  {
    id: "attempt-analyze",
    concurrency: [{ limit: 1, key: "event.data.userId" }],
    retries: 2,
    onFailure: async ({ event, error }) => {
      const data = event.data.event.data as {
        attemptId?: string;
        userId?: string;
      };
      if (!data?.attemptId) return;
      const msg =
        error instanceof Error
          ? error.message.slice(0, 500)
          : "attempt/analyze failed";
      await db.report.updateMany({
        where: {
          attemptId: data.attemptId,
          userId: data.userId,
          status: { in: ["PENDING", "PROCESSING"] },
        },
        data: { status: "FAILED", failureReason: msg },
      });
      logger.error(
        { attemptId: data.attemptId, err: msg },
        "attempt/analyze onFailure",
      );
    },
  },
  { event: "attempt.submitted" },
  async ({ event, step }) => {
    const { attemptId, userId, force } = event.data as {
      attemptId: string;
      userId: string;
      testId?: string;
      force?: boolean;
    };

    const existing = await step.run("load-or-create-report", async () => {
      const attempt = await db.attempt.findFirst({
        where: { id: attemptId, userId },
        include: {
          test: { include: { questions: { orderBy: { index: "asc" } } } },
          responses: true,
          events: true,
          report: true,
        },
      });
      if (!attempt) throw new Error("Attempt not found");
      if (attempt.status === "IN_PROGRESS") {
        throw new Error("Attempt still IN_PROGRESS");
      }

      if (attempt.report?.status === "READY" && !force) {
        return { skip: true as const, reportId: attempt.report.id };
      }

      const report = await db.report.upsert({
        where: { attemptId },
        create: {
          attemptId,
          userId,
          status: "PROCESSING",
        },
        update: {
          status: "PROCESSING",
          failureReason: null,
        },
      });

      return {
        skip: false as const,
        reportId: report.id,
        attempt,
      };
    });

    if (existing.skip) {
      return { ok: true, skipped: true, reportId: existing.reportId };
    }

    const attempt = existing.attempt!;
    const questions = attempt.test.questions;
    const scheme = attempt.test.markingScheme as MarkingScheme;

    // Ensure responses exist (re-score if empty — e.g. older attempts)
    const responses = await step.run("ensure-responses", async () => {
      if (attempt.responses.length > 0) return attempt.responses;
      const events: AttemptEventLike[] = attempt.events.map((e) => ({
        questionIndex: e.questionIndex,
        type: e.type as EventType,
        optionKey: e.optionKey,
        clientTs: e.clientTs,
      }));
      const scored = scoreAttempt({
        questions: questions.map((q) => ({
          index: q.index,
          correctKey: q.correctKey,
          flagged: q.flagged,
        })),
        events,
        scheme,
      });
      await db.$transaction(async (tx) => {
        await tx.response.deleteMany({ where: { attemptId } });
        for (const r of scored.responses) {
          await tx.response.create({
            data: {
              attemptId,
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
          where: { id: attemptId },
          data: { score: scored.score },
        });
      });
      return db.response.findMany({ where: { attemptId } });
    });

    // Cross-check low-confidence keys
    await step.run("cross-check-keys", async () => {
      for (const q of questions) {
        if (q.flagged) continue;
        if (q.answerConfidence != null && q.answerConfidence >= 1) continue;
        if (q.answerConfidence == null && q.correctKey) continue;
        const options = (q.options as { key: string; text: string }[]) ?? [];
        const checked = await crossCheckCorrectKey({
          userId,
          questionText: q.text,
          options,
          currentKey: q.correctKey,
        });
        if (checked.key && checked.confidence >= 0.6) {
          await db.question.update({
            where: { id: q.id },
            data: {
              correctKey: checked.key,
              answerConfidence: checked.confidence,
            },
          });
        }
      }
    });

    const freshQuestions = await step.run("reload-questions", async () => {
      return db.question.findMany({
        where: { testId: attempt.testId },
        orderBy: { index: "asc" },
      });
    });

    // Rebuild isCorrect if keys changed
    const scoredResponses = await step.run("regrade-if-needed", async () => {
      const qMap = new Map(freshQuestions.map((q) => [q.index, q]));
      const out = [];
      for (const r of responses) {
        const q = qMap.get(r.questionIndex);
        let isCorrect = r.isCorrect;
        let marks = r.marksAwarded;
        if (q && !q.flagged && r.selectedKey && q.correctKey) {
          isCorrect = r.selectedKey === q.correctKey;
          marks = isCorrect ? scheme.correct : scheme.wrong;
          if (r.isCorrect !== isCorrect || r.marksAwarded !== marks) {
            await db.response.update({
              where: { id: r.id },
              data: { isCorrect, marksAwarded: marks },
            });
          }
        }
        out.push({ ...r, isCorrect, marksAwarded: marks });
      }
      const score = out.reduce((s, r) => s + (r.marksAwarded ?? 0), 0);
      const maxScore =
        freshQuestions.filter((q) => !q.flagged).length * scheme.correct;
      await db.attempt.update({
        where: { id: attemptId },
        data: { score },
      });
      return { rows: out, score, maxScore };
    });

    const analysisBase = await step.run("build-analysis-rows", async () => {
      const events = attempt.events.map((e) => ({
        questionIndex: e.questionIndex,
        type: e.type,
        optionKey: e.optionKey,
        clientTs: e.clientTs,
      }));
      const inputs: QuestionAnalysisInput[] = freshQuestions.map((q) => {
        const r = scoredResponses.rows.find((x) => x.questionIndex === q.index);
        return {
          questionIndex: q.index,
          topic: q.topic,
          subtopic: q.subtopic,
          section: q.section,
          correctKey: q.correctKey,
          selectedKey: r?.selectedKey ?? null,
          isCorrect: r?.isCorrect ?? null,
          timeSpentSec: r?.timeSpentSec ?? 0,
          visitCount: r?.visitCount ?? 0,
          optionChanges: r?.optionChanges ?? 0,
          paletteState: r?.paletteState ?? "NOT_VISITED",
          optionTrail: optionTrailFromEvents(events, q.index),
        };
      });
      const topics = buildTopicAnalysis(inputs);
      const time = buildTimeAnalysis(inputs);
      const questionRows = buildQuestionAnalysisRows(inputs, time);
      return { topics, time, questionRows, inputs };
    });

    const explained = await step.run("explain-questions", async () => {
      const rows: QuestionAnalysisRow[] = [...analysisBase.questionRows];
      // Explain wrong + confused + slow-correct (cap for cost)
      const targets = rows
        .filter(
          (r) =>
            r.status === "wrong" ||
            r.isConfused ||
            r.isSlow ||
            r.status === "skipped",
        )
        .slice(0, 25);

      for (const target of targets) {
        const q = freshQuestions.find((x) => x.index === target.questionIndex);
        if (!q) continue;
        const options =
          (q.options as { key: string; text: string }[]) ?? [];
        let chunks: Awaited<ReturnType<typeof hybridSearchStudyChunks>> = [];
        try {
          chunks = await hybridSearchStudyChunks({
            userId,
            query: q.text.slice(0, 500),
            topK: 4,
          });
        } catch (err) {
          logger.warn({ err }, "hybrid search for explain failed");
        }
        const exp = await explainQuestion({
          userId,
          questionText: q.text,
          options,
          correctKey: q.correctKey,
          selectedKey: target.selectedKey,
          chunks,
        });
        const idx = rows.findIndex(
          (r) => r.questionIndex === target.questionIndex,
        );
        if (idx >= 0) {
          rows[idx] = {
            ...rows[idx]!,
            explanation: exp.explanation,
            notesCitations: exp.notesCitations,
            webSources: exp.webSources,
            explanationSource: exp.explanationSource,
          };
          await db.question.update({
            where: { id: q.id },
            data: {
              explanationCache: exp as unknown as Prisma.InputJsonValue,
            },
          });
        }
      }
      return rows;
    });

    const examProfile = await step.run("load-exam-profile", async () => {
      return db.examProfile.findUnique({ where: { userId } });
    });

    const cutoff = await step.run("cutoff-research", async () => {
      // Phase 6: AI papers use target-score comparison (no official cutoffs)
      if (attempt.test.source === "AI_GENERATED") {
        const maxScore = scoredResponses.maxScore;
        const score = scoredResponses.score;
        const targetMarks = Math.round(maxScore * 0.75);
        const delta = score - targetMarks;
        return {
          found: true as const,
          type: "target_score" as const,
          year: undefined,
          exam: examProfile?.type ?? "NEET",
          cutoffs: [
            {
              category: "Target (75% of max)",
              marks: targetMarks,
            },
          ],
          sourceUrls: [] as string[],
          verdict:
            delta >= 0
              ? `Above target by ${delta} marks (target ${targetMarks}/${maxScore})`
              : `Below target by ${Math.abs(delta)} marks (target ${targetMarks}/${maxScore})`,
          notFoundReason: undefined,
        };
      }
      if (attempt.test.source !== "PYQ_UPLOAD") {
        return {
          found: false as const,
          cutoffs: [],
          sourceUrls: [],
          verdict: null,
          notFoundReason: "Cutoff comparison only for PYQ papers",
        };
      }
      return researchExamCutoff({
        userId,
        examType: examProfile?.type ?? "NEET",
        paperYear: attempt.test.paperYear,
        paperTitle: attempt.test.title,
        score: scoredResponses.score,
        maxScore: scoredResponses.maxScore,
      });
    });

    const narrative = await step.run("report-narrative", async () => {
      return generateReportNarrative({
        userId,
        examType: examProfile?.type,
        score: scoredResponses.score,
        maxScore: scoredResponses.maxScore,
        topics: analysisBase.topics,
        time: analysisBase.time,
        questionSample: explained,
      });
    });

    // Enrich recommendations with gap ranking
    const gap = rankWeakTopicsForGap(
      analysisBase.topics,
      scheme.correct,
    );

    await step.run("save-report", async () => {
      await db.report.update({
        where: { id: existing.reportId },
        data: {
          status: "READY",
          score: scoredResponses.score,
          maxScore: scoredResponses.maxScore,
          summary: narrative.summary,
          topicAnalysis: analysisBase.topics as unknown as Prisma.InputJsonValue,
          timeAnalysis: analysisBase.time as unknown as Prisma.InputJsonValue,
          questionAnalysis: explained as unknown as Prisma.InputJsonValue,
          cutoffData: cutoff as unknown as Prisma.InputJsonValue,
          recommendations: {
            items: narrative.recommendations,
            gapCloserTopics: gap.slice(0, 5),
            pacingNote: narrative.pacingNote,
            moraleNote: narrative.moraleNote,
          } as unknown as Prisma.InputJsonValue,
          failureReason: null,
        },
      });
      await db.attempt.update({
        where: { id: attemptId },
        data: { status: "ANALYZED" },
      });
    });

    await step.run("mem0-writeback", async () => {
      const weak = analysisBase.topics
        .filter((t) => t.verdict === "WEAK")
        .map((t) => t.topic);
      const strong = analysisBase.topics
        .filter((t) => t.verdict === "STRONG")
        .map((t) => t.topic);
      const lines = [
        `Last test "${attempt.test.title}": score ${scoredResponses.score}/${scoredResponses.maxScore}.`,
        weak.length ? `Weak topics: ${weak.join(", ")}.` : "",
        strong.length ? `Strong topics: ${strong.join(", ")}.` : "",
        analysisBase.time.slowButCorrect.length
          ? `Slow-but-correct Q indices: ${analysisBase.time.slowButCorrect.join(", ")}.`
          : "",
        narrative.pacingNote ?? "",
      ]
        .filter(Boolean)
        .join(" ");

      await addMemory(userId, [
        { role: "user", content: "Summarize my latest mock test performance." },
        { role: "assistant", content: lines },
      ]);
    });

    await step.run("push-ready", async () => {
      await sendPushToUser(
        userId,
        "Result ready",
        `Your analysis for "${attempt.test.title}" is ready.`,
        { attemptId, reportId: existing.reportId, type: "report_ready" },
      );
    });

    return {
      ok: true,
      reportId: existing.reportId,
      score: scoredResponses.score,
      maxScore: scoredResponses.maxScore,
    };
  },
);
