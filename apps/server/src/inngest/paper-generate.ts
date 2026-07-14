import {
  embedText,
  flattenSyllabusTopics,
  generateQuestionsForTopic,
  JEE_MARKING,
  NEET_MARKING,
  planTopicQuotas,
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
    const questionCount = config.questionCount ?? 45;
    const difficulty = config.difficulty ?? "mixed";
    const mode =
      config.mode ??
      (config.topics && config.topics.length > 0 ? "manual" : "auto");

    const plan = await step.run("plan-topics", async () => {
      const exam = await db.examProfile.findUnique({ where: { userId } });
      const examType = exam?.type ?? "NEET";

      let syllabusTopics = flattenSyllabusTopics(exam?.syllabusTopics);
      if (syllabusTopics.length === 0 && (examType === "NEET" || examType === "JEE")) {
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
      const topicVerdicts: TopicVerdictRow[] = [...verdictMap.entries()].map(
        ([topic, verdict]) => ({ topic, verdict }),
      );

      const quotas = planTopicQuotas({
        questionCount,
        mode,
        selectedTopics: config.topics,
        topicVerdicts,
        syllabusTopics,
      });

      logger.info(
        { testId, mode, quotas, examType },
        "paper/generate topic plan",
      );
      return { quotas, examType, topicVerdicts };
    });

    const generated = await step.run("generate-and-gate", async () => {
      const accepted: GeneratedQuestion[] = [];
      const dropped: string[] = [];

      for (const quota of plan.quotas as TopicQuota[]) {
        let remaining = quota.count;
        let round = 0;
        while (remaining > 0 && round <= MAX_REGEN_ROUNDS) {
          round += 1;
          let notesContext = "";
          try {
            const chunks = await hybridSearchStudyChunks({
              userId,
              query: `${quota.topic} exam practice concepts`,
              topK: 6,
            });
            notesContext = chunks
              .map((c) => `[p.${c.pageNumber}] ${c.text}`)
              .join("\n\n");
          } catch (err) {
            logger.warn({ err, topic: quota.topic }, "notes retrieve failed");
          }

          let batch: GeneratedQuestion[] = [];
          try {
            batch = await generateQuestionsForTopic({
              userId,
              topic: quota.topic,
              count: remaining,
              difficulty,
              examType: plan.examType,
              notesContext,
              avoidStems: accepted.map((q) => q.text),
            });
          } catch (err) {
            logger.warn({ err, topic: quota.topic }, "generate batch failed");
            break;
          }

          for (const q of batch) {
            if (remaining <= 0) break;

            // Dedupe vs question_bank
            let dup = false;
            try {
              const vec = await embedText(q.text, userId);
              dup = await isDuplicateInQuestionBank({
                userId,
                stem: q.text,
                denseVector: vec,
              });
            } catch {
              dup = false;
            }
            if (dup) {
              dropped.push(`dup:${quota.topic}`);
              continue;
            }

            const gate = await validateGeneratedQuestion({
              userId,
              question: q,
            });
            if (!gate.valid) {
              dropped.push(`gate:${quota.topic}:${gate.reason}`);
              continue;
            }

            accepted.push(q);
            remaining -= 1;
          }
        }
      }

      if (accepted.length < Math.min(5, questionCount)) {
        throw new Error(
          `Too few valid questions generated (${accepted.length}). Dropped: ${dropped.slice(0, 10).join("; ")}`,
        );
      }

      return { accepted, dropped };
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
            answerConfidence: 0.85,
            topic: q.topic,
            subtopic: q.subtopic ?? null,
            flagged: false,
            explanationCache: q.briefExplanation
              ? ({ explanation: q.briefExplanation } as Prisma.InputJsonValue)
              : undefined,
          },
        });
        index += 1;
      }

      const totalMarks = generated.accepted.length * scheme.correct;
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
            generatedCount: generated.accepted.length,
            droppedHints: generated.dropped.slice(0, 20),
            topicVerdicts: plan.topicVerdicts,
          } as unknown as Prisma.InputJsonValue,
        },
      });

      // Index into question_bank for future dedupe
      try {
        await upsertQuestionBankItems(
          generated.accepted.map((q, i) => ({
            userId,
            testId,
            questionIndex: i,
            topic: q.topic,
            text: q.text,
            wasCorrect: null,
          })),
        );
      } catch (err) {
        logger.warn({ err }, "question_bank upsert after generate failed");
      }
    });

    await step.run("push-ready", async () => {
      await sendPushToUser(
        userId,
        "Paper ready",
        `Your AI paper "${test.title}" is ready (${generated.accepted.length} questions).`,
        { testId, type: "paper_ready" },
      );
    });

    return {
      ok: true,
      testId,
      count: generated.accepted.length,
      dropped: generated.dropped.length,
    };
  },
);
