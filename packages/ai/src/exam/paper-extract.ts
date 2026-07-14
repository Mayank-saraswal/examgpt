import { generateObject } from "ai";
import { z } from "zod";
import { getLanguageModel, getTaskModelId } from "../providers";
import { withAiUsage } from "../usage";

export const extractedOptionSchema = z.object({
  key: z.string().min(1).max(4),
  text: z.string().min(1),
});

export const extractedQuestionSchema = z.object({
  index: z.number().int().positive(),
  section: z.string().optional(),
  text: z.string().min(1),
  options: z.array(extractedOptionSchema).min(2),
  correctKey: z.string().optional(),
  topic: z.string().optional(),
  subtopic: z.string().optional(),
});

export const paperExtractSchema = z.object({
  title: z.string().optional(),
  paperYear: z.number().int().optional(),
  durationMin: z.number().int().positive().optional(),
  questions: z.array(extractedQuestionSchema).min(1),
});

export type ExtractedPaper = z.infer<typeof paperExtractSchema>;
export type ExtractedQuestion = z.infer<typeof extractedQuestionSchema>;

/**
 * Extract MCQs from OCR markdown of a paper (temperature 0).
 */
export async function extractPaperQuestions(opts: {
  markdown: string;
  userId?: string | null;
}): Promise<ExtractedPaper> {
  const modelId = getTaskModelId("vision-extract");
  const result = await withAiUsage({
    userId: opts.userId,
    task: "vision-extract",
    model: modelId,
    run: async () => {
      const model = getLanguageModel("vision-extract");
      return generateObject({
        model,
        schema: paperExtractSchema,
        temperature: 0,
        prompt: `Extract all multiple-choice questions from this exam paper OCR text.
Rules:
- Preserve option keys A/B/C/D when present.
- Every question MUST have question text and at least 2 options.
- Include correctKey only if an answer key is clearly present in the text.
- Assign section labels (Physics/Chemistry/Biology/Math) when clear.
- index is 1-based sequential order.

OCR:
${opts.markdown.slice(0, 120_000)}`,
      });
    },
  });
  return result.object;
}

export type ValidatedQuestion = ExtractedQuestion & {
  answerConfidence: number;
  needsReview: boolean;
  validationErrors: string[];
};

/**
 * Validation pass: every Q has text + ≥2 options.
 * Missing answers → answerConfidence < 1 (AI-solved placeholder = 0.5).
 */
export function validateExtractedQuestions(
  questions: ExtractedQuestion[],
): ValidatedQuestion[] {
  return questions.map((q) => {
    const errors: string[] = [];
    if (!q.text?.trim()) errors.push("missing text");
    if (!q.options || q.options.length < 2) errors.push("need ≥2 options");
    const keys = new Set(q.options.map((o) => o.key));
    if (q.correctKey && !keys.has(q.correctKey)) {
      errors.push("correctKey not in options");
    }

    let answerConfidence = 1;
    let needsReview = errors.length > 0;
    if (!q.correctKey) {
      answerConfidence = 0.5;
      needsReview = true;
    } else if (errors.length > 0) {
      answerConfidence = 0.3;
    }

    return {
      ...q,
      answerConfidence,
      needsReview,
      validationErrors: errors,
    };
  });
}

/**
 * Solve missing answers with low confidence (model).
 */
export async function solveMissingAnswers(opts: {
  questions: ValidatedQuestion[];
  userId?: string | null;
}): Promise<ValidatedQuestion[]> {
  const out: ValidatedQuestion[] = [];
  for (const q of opts.questions) {
    if (q.correctKey && q.answerConfidence >= 1) {
      out.push(q);
      continue;
    }
    if (q.validationErrors.includes("missing text") || q.options.length < 2) {
      out.push(q);
      continue;
    }
    try {
      const modelId = getTaskModelId("vision-extract");
      const result = await withAiUsage({
        userId: opts.userId,
        task: "vision-extract",
        model: modelId,
        run: async () => {
          const model = getLanguageModel("vision-extract");
          return generateObject({
            model,
            schema: z.object({
              correctKey: z.string(),
              confidence: z.number().min(0).max(1),
            }),
            temperature: 0,
            prompt: `Solve this MCQ. Return the option key and confidence 0-1.
Question: ${q.text}
Options: ${q.options.map((o) => `${o.key}) ${o.text}`).join("\n")}`,
          });
        },
      });
      out.push({
        ...q,
        correctKey: result.object.correctKey,
        answerConfidence: Math.min(0.85, result.object.confidence),
        needsReview: result.object.confidence < 0.8 || q.needsReview,
      });
    } catch {
      out.push({ ...q, needsReview: true, answerConfidence: 0.2 });
    }
  }
  return out;
}
