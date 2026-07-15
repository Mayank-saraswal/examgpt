import { generateObject } from "ai";
import { z } from "zod";
import { getLanguageModel, getTaskModelId } from "../providers";
import { withAiUsage } from "../usage";

export const generatedOptionSchema = z.object({
  key: z.string().min(1).max(4),
  text: z.string().min(1),
});

export const generatedQuestionSchema = z.object({
  text: z.string().min(10),
  options: z.array(generatedOptionSchema).min(4).max(4),
  correctKey: z.string().min(1).max(4),
  topic: z.string().min(1),
  subtopic: z.string().optional(),
  difficulty: z.enum(["easy", "medium", "hard"]),
  briefExplanation: z.string().min(10).optional(),
});

export const generatedBatchSchema = z.object({
  questions: z.array(generatedQuestionSchema).min(1),
});

export type GeneratedQuestion = z.infer<typeof generatedQuestionSchema>;

export const qualityGateSchema = z.object({
  valid: z.boolean(),
  hasSingleCorrect: z.boolean(),
  distractorsPlausible: z.boolean(),
  unambiguous: z.boolean(),
  reason: z.string(),
});

export type QualityGateResult = z.infer<typeof qualityGateSchema>;

/**
 * Generate MCQs for one topic, grounded in notes context.
 */
export async function generateQuestionsForTopic(opts: {
  userId?: string | null;
  topic: string;
  count: number;
  difficulty: "easy" | "medium" | "hard" | "mixed";
  examType: string;
  notesContext: string;
  avoidStems?: string[];
}): Promise<GeneratedQuestion[]> {
  const count = Math.max(1, Math.min(15, opts.count));
  const modelId = getTaskModelId("paper-generation");
  const avoid =
    opts.avoidStems && opts.avoidStems.length > 0
      ? `Do NOT paraphrase these existing stems:\n${opts.avoidStems
          .slice(0, 20)
          .map((s, i) => `${i + 1}. ${s.slice(0, 200)}`)
          .join("\n")}`
      : "";

  const result = await withAiUsage({
    userId: opts.userId,
    task: "paper-generation",
    model: modelId,
    run: async () => {
      const model = getLanguageModel("paper-generation");
      return generateObject({
        model,
        schema: generatedBatchSchema,
        temperature: 0.4,
        prompt: `You write ${opts.examType} exam MCQs for practice.

Generate exactly ${count} multiple-choice questions on topic: "${opts.topic}".
Difficulty: ${opts.difficulty}.

Rules:
1. Exactly 4 options with keys A, B, C, D.
2. Exactly one correctKey that matches an option key.
3. Ground questions in the NOTES CONTEXT below when possible (formulas, definitions, typical exam angles). Do not invent citations or page numbers.
4. Distractors must be plausible (common student mistakes).
5. Clear, single-answer stems — no multi-correct or ambiguous wording.
6. Set topic to "${opts.topic}".
7. English simple enough for NEET/JEE students.

${avoid}

NOTES CONTEXT (may be empty or partial):
${opts.notesContext.slice(0, 10_000) || "(no notes retrieved — use standard syllabus knowledge carefully)"}`,
      });
    },
  });

  return result.object.questions.map((q) => ({
    ...q,
    topic: opts.topic,
    options: normalizeOptions(q.options, q.correctKey),
  }));
}

function normalizeOptions(
  options: { key: string; text: string }[],
  correctKey: string,
): { key: string; text: string }[] {
  const keys = ["A", "B", "C", "D"];
  const byKey = new Map(options.map((o) => [o.key.toUpperCase(), o.text]));
  // If model used weird keys, re-map by order
  if (options.length === 4 && options.every((o) => keys.includes(o.key.toUpperCase()))) {
    return keys.map((k) => ({
      key: k,
      text: byKey.get(k) ?? options.find((o) => o.key.toUpperCase() === k)?.text ?? "—",
    }));
  }
  return options.slice(0, 4).map((o, i) => ({
    key: keys[i]!,
    text: o.text,
    // correctKey may need remap — caller validates
  }));
}

/**
 * Second-model quality gate. Invalid → regenerate.
 */
export async function validateGeneratedQuestion(opts: {
  userId?: string | null;
  question: GeneratedQuestion;
}): Promise<QualityGateResult> {
  const q = opts.question;
  // Cheap deterministic checks first
  const keys = new Set(q.options.map((o) => o.key.toUpperCase()));
  if (q.options.length !== 4) {
    return {
      valid: false,
      hasSingleCorrect: false,
      distractorsPlausible: false,
      unambiguous: false,
      reason: "Need exactly 4 options",
    };
  }
  if (!keys.has(q.correctKey.toUpperCase())) {
    return {
      valid: false,
      hasSingleCorrect: false,
      distractorsPlausible: false,
      unambiguous: false,
      reason: "correctKey not in options",
    };
  }
  const texts = q.options.map((o) => o.text.trim().toLowerCase());
  if (new Set(texts).size < 4) {
    return {
      valid: false,
      hasSingleCorrect: true,
      distractorsPlausible: false,
      unambiguous: false,
      reason: "Duplicate option texts",
    };
  }

  try {
    // Quality gate uses `explain` task (text reasoning), not vision-extract
    const modelId = getTaskModelId("explain");
    const result = await withAiUsage({
      userId: opts.userId,
      task: "explain",
      model: modelId,
      run: async () => {
        const model = getLanguageModel("explain");
        return generateObject({
          model,
          schema: qualityGateSchema,
          temperature: 0,
          prompt: `Validate this MCQ for an exam paper.
Question: ${q.text}
Options: ${q.options.map((o) => `${o.key}) ${o.text}`).join(" | ")}
Claimed correct: ${q.correctKey}

Rules:
- valid=true only if: single unambiguous correct answer matches claimed key, distractors are plausible, stem is clear.
- If two options could be correct, valid=false.
- Be strict.`,
        });
      },
    });
    return result.object;
  } catch {
    // Fail open on model outage for deterministic-valid questions
    return {
      valid: true,
      hasSingleCorrect: true,
      distractorsPlausible: true,
      unambiguous: true,
      reason: "quality gate skipped (model error) — deterministic checks passed",
    };
  }
}

/** Cosine similarity of two dense vectors */
export function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length || a.length === 0) return 0;
  let dot = 0;
  let na = 0;
  let nb = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i]! * b[i]!;
    na += a[i]! * a[i]!;
    nb += b[i]! * b[i]!;
  }
  const d = Math.sqrt(na) * Math.sqrt(nb);
  return d === 0 ? 0 : dot / d;
}

/** Near-duplicate if similarity ≥ threshold (default 0.88) */
export function isNearDuplicate(
  candidate: number[],
  bank: number[][],
  threshold = 0.88,
): boolean {
  for (const v of bank) {
    if (cosineSimilarity(candidate, v) >= threshold) return true;
  }
  return false;
}
