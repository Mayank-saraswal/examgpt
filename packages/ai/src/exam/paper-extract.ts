import { generateObject } from "ai";
import { z } from "zod";
import { getLanguageModel, getTaskModelId } from "../providers";
import { withAiUsage } from "../usage";

/** Gemini-style normalized bbox 0–1000 (ymin, xmin, ymax, xmax). */
export const normalizedBBoxSchema = z.object({
  ymin: z.number(),
  xmin: z.number(),
  ymax: z.number(),
  xmax: z.number(),
});

export const extractedOptionSchema = z.object({
  key: z.string().min(1).max(4),
  text: z.string().min(1),
  /** Optional figure attached only to this option (rare) */
  hasImage: z.boolean().nullable(),
  imageBbox: normalizedBBoxSchema.nullable(),
});

/**
 * OpenAI structured outputs require every property key to appear in `required`.
 * Use `.nullable()` (not bare `.optional()`) so optional fields serialize as
 * required + null-able instead of missing from the required array.
 */
export const extractedQuestionSchema = z.object({
  index: z.number().int().positive(),
  section: z.string().nullable(),
  text: z.string().min(1),
  options: z.array(extractedOptionSchema).min(2),
  correctKey: z.string().nullable(),
  topic: z.string().nullable(),
  subtopic: z.string().nullable(),
  /** True if stem/options reference a figure/graph/diagram on the page */
  hasFigure: z.boolean().nullable(),
  /** Normalized bbox of primary figure for this question (0–1000), null if none */
  figureBbox: normalizedBBoxSchema.nullable(),
  /** Model uncertain about crop quality (OpenAI degraded path) */
  figureUncertain: z.boolean().nullable(),
  /** 1-based source page if multi-page OCR blob */
  pageNumber: z.number().int().positive().nullable(),
});

export const paperExtractSchema = z.object({
  title: z.string().nullable(),
  paperYear: z.number().int().nullable(),
  durationMin: z.number().int().positive().nullable(),
  questions: z.array(extractedQuestionSchema).min(1),
});

export type ExtractedPaper = {
  title?: string;
  paperYear?: number;
  durationMin?: number;
  questions: ExtractedQuestion[];
};
export type ExtractedQuestion = {
  index: number;
  section?: string;
  text: string;
  options: {
    key: string;
    text: string;
    hasImage?: boolean;
    imageBbox?: { ymin: number; xmin: number; ymax: number; xmax: number };
  }[];
  correctKey?: string;
  topic?: string;
  subtopic?: string;
  hasFigure?: boolean;
  figureBbox?: { ymin: number; xmin: number; ymax: number; xmax: number };
  figureUncertain?: boolean;
  pageNumber?: number;
};

function nullToUndef<T>(v: T | null | undefined): T | undefined {
  return v == null ? undefined : v;
}

function normalizeExtracted(raw: z.infer<typeof paperExtractSchema>): ExtractedPaper {
  return {
    title: nullToUndef(raw.title),
    paperYear: nullToUndef(raw.paperYear) ?? undefined,
    durationMin: nullToUndef(raw.durationMin) ?? undefined,
    questions: raw.questions.map((q) => ({
      index: q.index,
      section: nullToUndef(q.section),
      text: q.text,
      options: q.options.map((o) => ({
        key: o.key,
        text: o.text,
        hasImage: nullToUndef(o.hasImage) ?? undefined,
        imageBbox: nullToUndef(o.imageBbox) ?? undefined,
      })),
      correctKey: nullToUndef(q.correctKey),
      topic: nullToUndef(q.topic),
      subtopic: nullToUndef(q.subtopic),
      hasFigure: nullToUndef(q.hasFigure) ?? undefined,
      figureBbox: nullToUndef(q.figureBbox) ?? undefined,
      figureUncertain: nullToUndef(q.figureUncertain) ?? undefined,
      pageNumber: nullToUndef(q.pageNumber) ?? undefined,
    })),
  };
}

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
- Include correctKey only if an answer key is clearly present in the text; otherwise set correctKey to null.
- Assign section labels (Physics/Chemistry/Biology/Math) when clear; otherwise null.
- topic/subtopic null when unknown.
- title/paperYear/durationMin null when unknown.
- index is 1-based sequential order.
- hasFigure=true if the question references a figure/graph/diagram/table-image; else false.
- figureBbox: if hasFigure and a page image was provided, use Gemini-style normalized 0–1000 coords [ymin,xmin,ymax,xmax] relative to the full page; else null.
- figureUncertain=true if bbox is a rough guess (e.g. text-only OCR without reliable image layout).
- options[].hasImage / imageBbox similarly for option-only figures; usually null.
- pageNumber: 1-based page if known from OCR markers; else null.

OCR:
${opts.markdown.slice(0, 120_000)}`,
      });
    },
  });
  return normalizeExtracted(result.object);
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
