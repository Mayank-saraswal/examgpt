import { generateObject } from "ai";
import { z } from "zod";
import type { RetrievedChunk } from "../citations";
import { validateAndSanitizeCitations } from "../citations";
import { getLanguageModel, getTaskModelId } from "../providers";
import { withAiUsage } from "../usage";

const explainSchema = z.object({
  explanation: z.string().min(20).max(1200),
  /** Machine citations only from provided context */
  usedNotes: z.boolean(),
});

export type QuestionExplainResult = {
  explanation: string;
  notesCitations: {
    documentId: string;
    title: string;
    pageNumber: number;
  }[];
  webSources: { url: string; title: string }[];
  explanationSource: "notes" | "web" | "model" | "none";
};

/**
 * Short explanation for a graded question.
 * Prefer notes chunks (validated citations); else model-only with no fake pages.
 */
export async function explainQuestion(opts: {
  userId?: string | null;
  questionText: string;
  options: { key: string; text: string }[];
  correctKey: string | null;
  selectedKey: string | null;
  chunks: RetrievedChunk[];
}): Promise<QuestionExplainResult> {
  const optsText = opts.options
    .map((o) => `${o.key}) ${o.text}`)
    .join("\n");
  const context =
    opts.chunks.length > 0
      ? opts.chunks
          .map(
            (c) =>
              `[${c.title}, p. ${c.pageNumber}] (id=${c.documentId})\n${c.text}`,
          )
          .join("\n\n")
      : "(no notes context)";

  try {
    const modelId = getTaskModelId("report-analysis");
    const result = await withAiUsage({
      userId: opts.userId,
      task: "report-analysis",
      model: modelId,
      run: async () => {
        const model = getLanguageModel("report-analysis");
        return generateObject({
          model,
          schema: explainSchema,
          temperature: 0,
          prompt: `Explain this MCQ for a student report.
Correct answer: ${opts.correctKey ?? "unknown"}
Student answered: ${opts.selectedKey ?? "skipped"}

Question:
${opts.questionText}

Options:
${optsText}

NOTES CONTEXT (cite only these pages if used; form [Title, p. N]):
${context.slice(0, 8000)}

Rules:
- 3–6 sentences max.
- If NOTES CONTEXT answers it, set usedNotes=true and cite [Title, p. N].
- If notes insufficient, set usedNotes=false and explain from reasoning without page citations.
- Never invent page numbers or book titles.`,
        });
      },
    });

    const validated = validateAndSanitizeCitations(
      result.object.explanation,
      opts.chunks,
    );

    if (result.object.usedNotes && validated.valid.length > 0) {
      return {
        explanation: validated.sanitizedContent,
        notesCitations: validated.valid.map((c) => ({
          documentId: c.documentId,
          title: c.title,
          pageNumber: c.pageNumber,
        })),
        webSources: [],
        explanationSource: "notes",
      };
    }

    return {
      explanation: validated.sanitizedContent,
      notesCitations: [],
      webSources: [],
      explanationSource: result.object.usedNotes ? "model" : "model",
    };
  } catch {
    const key = opts.correctKey ?? "?";
    return {
      explanation: `Correct option: ${key}. Review this concept in your notes and re-attempt similar questions.`,
      notesCitations: [],
      webSources: [],
      explanationSource: "none",
    };
  }
}

/**
 * Cross-check AI-solved answer keys (confidence < 1).
 */
export async function crossCheckCorrectKey(opts: {
  userId?: string | null;
  questionText: string;
  options: { key: string; text: string }[];
  currentKey: string | null;
}): Promise<{ key: string | null; confidence: number }> {
  const schema = z.object({
    correctKey: z.string().nullable(),
    confidence: z.number().min(0).max(1),
    rationale: z.string(),
  });
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
          schema,
          temperature: 0,
          prompt: `Solve this MCQ. Return the correct option key only if confident.
Question: ${opts.questionText}
Options: ${opts.options.map((o) => `${o.key}) ${o.text}`).join(" | ")}
Existing key: ${opts.currentKey ?? "none"}`,
        });
      },
    });
    return {
      key: result.object.correctKey,
      confidence: result.object.confidence,
    };
  } catch {
    return { key: opts.currentKey, confidence: 0.4 };
  }
}
