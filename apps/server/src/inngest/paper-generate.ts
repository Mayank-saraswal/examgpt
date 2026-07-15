import {
  embedText,
  flattenSyllabusTopics,
  generateQuestionsForTopic,
  JEE_MARKING,
  mergeVerdictsWithBankAccuracy,
  NEET_MARKING,
  planTopicQuotas,
  runQualityRegenLoop,
  validateGeneratedQuestion,
  type GeneratedQuestion,
  type MarkingScheme,
  type TopicQuota,
  type TopicVerdictRow,
} from "@examgpt/ai";
import { bundledSyllabus } from "@examgpt/api/seed";
import { db } from "@examgpt/db";
import type { Prisma } from "@prisma/client";
import { inngest } from "./client";
import { logger } from "../logger";
import { hybridSearchStudyChunks } from "../qdrant/search";
import {
  ensureQuestionBankCollection,
  isDuplicateInQuestionBank,
  topicAccuracyFromQuestionBank,
  upsertQuestionBankItems,
} from "../qdrant/question-bank";
import { sendPushToUser } from "../push";

const MAX_REGEN_ROUNDS = 2;

/**
 * paper/generate — adaptive AI paper from weak topics + notes context.
 * Trigger: test.generate_requested
 */
export const paperGenerate = inngest.createFunction(
  {
    id: "paper-generate",
    concurrency: [{ limit: 1, key: "event.data.userId" }],
    retries: 2,
    onFailure: async ({ event, error }) => {
      const data = event.data.event.data as {
        testId?: string;
        userId?: string;
      };
      if (!data?.testId) return;
      const msg =
        error instanceof Error
          ? error.message.slice(0, 500)
          : "paper/generate failed";
      await db.test.updateMany({
        where: {
          id: data.testId,
          userId: data.userId,
          status: "GENERATING",
        },
        data: { status: "FAILED", failureReason: msg },
      });
      logger.error({ testId: data.testId, err: msg }, "paper/generate onFailure");
    },
  },
  { event: "test.generate_requested" },
  async ({ event, step }) => {
    const { testId, userId } = event.data as {
      testId: string;
      userId: string;
    };

    await step.run("ensure-question-bank", async () => {
      await ensureQuestionBankCollection();
    });

    const test = await step.run("load-test", async () => {
      const t = await db.test.findFirst({
        where: { id: testId, userId, deletedAt: null, source: "AI_GENERATED" },
      });
      if (!t) throw new Error("Test not found");
      await db.test.update({
        where: { id: testId },
        data: { status: "GENERATING", failureReason: null },
      });
      return t;
    });

    const config = (test.config ?? {}) as {
      questionCount?: number;
      topics?: string[];
      difficulty?: "easy" | "medium" | "hard" | "mixed";
      mode?: "auto" | "manual";
    };
    const questionCount = config.questionCount ?? 20;
    const difficulty = config.difficulty ?? "mixed";
    const mode =
      config.mode ??
      (config.topics && config.topics.length > 0 ? "manual" : "auto");

    const plan = await step.run("plan-topics", async () => {
      const exam = await db.examProfile.findUnique({ where: { userId } });
      const examType = exam?.type ?? "NEET";

      let syllabusTopics = flattenSyllabusTopics(exam?.syllabusTopics);
      if (
        syllabusTopics.length === 0 &&
        (examType === "NEET" || examType === "JEE")
      ) {
        const bundled =
          examType === "JEE" ? bundledSyllabus.JEE : bundledSyllabus.NEET;
        syllabusTopics = flattenSyllabusTopics(bundled);
      }

      const reports = await db.report.findMany({
        where: { userId, status: "READY" },
        orderBy: { createdAt: "desc" },
        take: 5,
        select: { topicAnalysis: true },
      });
      const verdictMap = new Map<string, TopicVerdictRow["verdict"]>();
      for (const r of reports) {
        const rows = r.topicAnalysis as
          | { topic: string; verdict: string }[]
          | null;
        if (!Array.isArray(rows)) continue;
        for (const row of rows) {
          if (
            row.verdict === "WEAK" ||
            row.verdict === "MODERATE" ||
            row.verdict === "STRONG"
          ) {
            if (!verdictMap.has(row.topic)) {
              verdictMap.set(
                row.topic,
                row.verdict as TopicVerdictRow["verdict"],
              );
            }
          }
        }
      }
      let topicVerdicts: TopicVerdictRow[] = [...verdictMap.entries()].map(
        ([topic, verdict]) => ({ topic, verdict }),
      );

      // Merge question_bank historical accuracy
      try {
        const bankAcc = await topicAccuracyFromQuestionBank(userId);
        topicVerdicts = mergeVerdictsWithBankAccuracy(topicVerdicts, bankAcc);
      } catch (err) {
        logger.warn({ err }, "bank accuracy merge failed");
      }

      const quotas = planTopicQuotas({
        questionCount,
        mode,
        selectedTopics: config.topics,
        topicVerdicts,
        syllabusTopics,
      });

      logger.info(
        { testId, mode, quotas, examType, hasReports: reports.length > 0 },
        "paper/generate topic plan",
      );
      return { quotas, examType, topicVerdicts, syllabusTopics };
    });

    const generated = await step.run("generate-and-gate", async () => {
      const accepted: (GeneratedQuestion & {
        fromSyllabusOnly?: boolean;
      })[] = [];
      const dropped: string[] = [];
      const topicWarnings: string[] = [];

      for (const quota of plan.quotas as TopicQuota[]) {
        let notesContext = "";
        let fromSyllabusOnly = false;
        try {
          const chunks = await hybridSearchStudyChunks({
            userId,
            query: `${quota.topic} exam practice concepts definitions formulas`,
            topK: 6,
          });
          notesContext = chunks
            .map((c) => `[p.${c.pageNumber}] ${c.text}`)
            .join("\n\n");
          if (chunks.length === 0 || notesContext.trim().length < 80) {
            fromSyllabusOnly = true;
            topicWarnings.push(
              `No notes found for "${quota.topic}" — generated from syllabus knowledge only`,
            );
          }
        } catch (err) {
          logger.warn({ err, topic: quota.topic }, "notes retrieve failed");
          fromSyllabusOnly = true;
          topicWarnings.push(
            `Notes retrieval failed for "${quota.topic}" — syllabus-only generation`,
          );
        }

        const loop = await runQualityRegenLoop(quota.count, {
          maxRounds: MAX_REGEN_ROUNDS,
          generate: async (need) => {
            const batch = await generateQuestionsForTopic({
              userId,
              topic: quota.topic,
              count: need,
              difficulty,
              examType: plan.examType,
              notesContext,
              avoidStems: accepted.map((q) => q.text),
            });
            return batch.map((q) => ({ ...q, fromSyllabusOnly }));
          },
          isDuplicate: async (q) => {
            try {
              const vec = await embedText(q.text, userId);
              return await isDuplicateInQuestionBank({
                userId,
                stem: q.text,
                denseVector: vec,
              });
            } catch {
              return false;
            }
          },
          validate: async (q) => {
            const gate = await validateGeneratedQuestion({
              userId,
              question: q,
            });
            return { valid: gate.valid, reason: gate.reason };
          },
        });

        accepted.push(...loop.accepted);
        dropped.push(...loop.dropped);
      }

      if (accepted.length < Math.min(5, questionCount)) {
        throw new Error(
          `Too few valid questions generated (${accepted.length} of ${questionCount}). ${dropped.slice(0, 8).join("; ")}`,
        );
      }

      return {
        accepted,
        dropped,
        topicWarnings,
        requested: questionCount,
      };
    });

    await step.run("persist-questions", async () => {
      const scheme: MarkingScheme =
        plan.examType === "JEE" ? JEE_MARKING : NEET_MARKING;
      await db.question.deleteMany({ where: { testId } });

      let index = 0;
      for (const q of generated.accepted) {
        await db.question.create({
          data: {
            testId,
            index,
            section: q.topic,
            text: q.text,
            options: q.options as unknown as Prisma.InputJsonValue,
            correctKey: q.correctKey.toUpperCase(),
            answerConfidence: q.fromSyllabusOnly ? 0.7 : 0.85,
            topic: q.topic,
            subtopic: q.subtopic ?? null,
            flagged: false,
            explanationCache: {
              explanation: q.briefExplanation ?? null,
              fromSyllabusOnly: q.fromSyllabusOnly ?? false,
            } as Prisma.InputJsonValue,
          },
        });
        index += 1;
      }

      const totalMarks = generated.accepted.length * scheme.correct;
      const qualityMessage =
        generated.accepted.length < generated.requested
          ? `${generated.accepted.length} of ${generated.requested} questions passed quality checks`
          : null;

      await db.test.update({
        where: { id: testId },
        data: {
          status: "READY",
          totalMarks,
          markingScheme: scheme as unknown as Prisma.InputJsonValue,
          failureReason: null,
          config: {
            ...config,
            mode,
            plannedTopics: plan.quotas,
            requestedCount: generated.requested,
            generatedCount: generated.accepted.length,
            qualityMessage,
            topicWarnings: generated.topicWarnings.slice(0, 20),
            droppedHints: generated.dropped.slice(0, 30),
            topicVerdicts: plan.topicVerdicts,
          } as unknown as Prisma.InputJsonValue,
        },
      });

      try {
        await upsertQuestionBankItems(
          generated.accepted.map((q, i) => ({
            userId,
            testId,
            questionIndex: i,
            topic: q.topic,
            text: q.text,
            wasCorrect: null,
            fromSyllabusOnly: q.fromSyllabusOnly ?? false,
          })),
        );
      } catch (err) {
        logger.warn({ err }, "question_bank upsert after generate failed");
      }
    });

    await step.run("push-ready", async () => {
      const body =
        generated.accepted.length < generated.requested
          ? `"${test.title}" ready — ${generated.accepted.length} of ${generated.requested} questions passed quality checks.`
          : `Your AI paper "${test.title}" is ready (${generated.accepted.length} questions).`;
      await sendPushToUser(userId, "Paper ready", body, {
        testId,
        type: "paper_ready",
      });
    });

    return {
      ok: true,
      testId,
      count: generated.accepted.length,
      requested: generated.requested,
      dropped: generated.dropped.length,
    };
  },
);
