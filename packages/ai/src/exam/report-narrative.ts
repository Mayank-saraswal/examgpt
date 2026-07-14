import { generateObject } from "ai";
import { z } from "zod";
import { getLanguageModel, getTaskModelId } from "../providers";
import { withAiUsage } from "../usage";
import type { QuestionAnalysisRow, TopicAnalysisRow, TimeAnalysis } from "./analysis";

export const reportNarrativeSchema = z.object({
  summary: z
    .string()
    .min(40)
    .describe("2–4 sentence coach summary of the attempt for the student"),
  recommendations: z
    .array(
      z.object({
        priority: z.number().int().min(1).max(10),
        topic: z.string(),
        action: z.string(),
        reason: z.string(),
      }),
    )
    .min(1)
    .max(8),
  pacingNote: z.string().optional(),
  moraleNote: z.string().optional(),
});

export type ReportNarrative = z.infer<typeof reportNarrativeSchema>;

/**
 * Structured report narrative via report-analysis model (generateObject only).
 */
export async function generateReportNarrative(opts: {
  userId?: string | null;
  examType?: string | null;
  score: number;
  maxScore: number;
  topics: TopicAnalysisRow[];
  time: TimeAnalysis;
  questionSample: Pick<
    QuestionAnalysisRow,
    "questionIndex" | "status" | "topic" | "isSlow" | "isConfused" | "confusionNote"
  >[];
}): Promise<ReportNarrative> {
  const modelId = getTaskModelId("report-analysis");
  const payload = {
    examType: opts.examType ?? "NEET",
    score: opts.score,
    maxScore: opts.maxScore,
    topics: opts.topics,
    time: opts.time,
    questions: opts.questionSample.slice(0, 40),
  };

  try {
    const result = await withAiUsage({
      userId: opts.userId,
      task: "report-analysis",
      model: modelId,
      run: async () => {
        const model = getLanguageModel("report-analysis");
        return generateObject({
          model,
          schema: reportNarrativeSchema,
          temperature: 0.3,
          prompt: `You are ExamGPT report coach for competitive exams (NEET/JEE).
Write a structured performance report from the JSON below.
Rules:
- Be specific about weak topics and pacing habits.
- recommendations must be actionable study steps (not generic "study more").
- Do NOT invent cutoff ranks or percentiles.
- Keep summary under 120 words, simple English (Hinglish OK in moraleNote only).

DATA:
${JSON.stringify(payload)}`,
        });
      },
    });
    return result.object;
  } catch {
    // Deterministic fallback when model unavailable
    const weak = opts.topics.filter((t) => t.verdict === "WEAK").map((t) => t.topic);
    const strong = opts.topics
      .filter((t) => t.verdict === "STRONG")
      .map((t) => t.topic);
    return {
      summary: `You scored ${opts.score}/${opts.maxScore}. ${
        weak.length
          ? `Focus next on: ${weak.slice(0, 3).join(", ")}.`
          : "Topic coverage looks balanced."
      } ${
        opts.time.slowButCorrect.length
          ? `${opts.time.slowButCorrect.length} correct answers were slow — review those for speed.`
          : ""
      }`.trim(),
      recommendations: (weak.length ? weak : ["General revision"]).slice(0, 5).map(
        (topic, i) => ({
          priority: i + 1,
          topic,
          action: `Revise ${topic} notes and re-attempt 10 mixed MCQs`,
          reason: weak.includes(topic)
            ? "Marked WEAK from this attempt"
            : "Maintain accuracy",
        }),
      ),
      pacingNote:
        opts.time.rushedWrong.length > 0
          ? `You rushed ${opts.time.rushedWrong.length} wrong answers — slow down on first read.`
          : undefined,
      moraleNote: strong.length
        ? `Strong areas: ${strong.join(", ")}. Build on these.`
        : undefined,
    };
  }
}
