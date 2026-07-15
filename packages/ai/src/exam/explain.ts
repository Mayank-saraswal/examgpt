import { generateObject } from "ai";
import { z } from "zod";
import type { RetrievedChunk } from "../citations";
import { validateAndSanitizeCitations } from "../citations";
import { getLanguageModel, getTaskModelId } from "../providers";
import { selectExplainTask, type AiTask } from "../registry";
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
  taskUsed: AiTask;
};

/**
 * Short explanation for a graded question.
 * Prefer notes chunks (validated citations); else model-only with no fake pages.
 * Questions with imageKeys use `explain-vision` + optional cropped figure bytes.
 */
export async function explainQuestion(opts: {
  userId?: string | null;
  questionText: string;
  options: { key: string; text: string }[];
  correctKey: string | null;
  selectedKey: string | null;
  chunks: RetrievedChunk[];
  /** Storage keys for cropped figures — routes to explain-vision when non-empty */
  imageKeys?: string[];
  /** Optional image bytes for vision explain (PNG/JPEG) */
  image?: { data: Uint8Array | Buffer; mediaType: "image/png" | "image/jpeg" | "image/webp" };
}): Promise<QuestionExplainResult> {
  const task = selectExplainTask(opts.imageKeys);
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
    const modelId = getTaskModelId(task);
    const result = await withAiUsage({
      userId: opts.userId,
      task,
      model: modelId,
      run: async () => {
        const model = getLanguageModel(task);
        const textPrompt = `Explain this MCQ for a student report.
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
- Never invent page numbers or book titles.
${task === "explain-vision" ? "- Use the attached figure/diagram when explaining." : ""}`;

        if (task === "explain-vision" && opts.image) {
          const bytes = Buffer.isBuffer(opts.image.data)
            ? opts.image.data
            : Buffer.from(opts.image.data);
          return generateObject({
            model,
            schema: explainSchema,
            temperature: 0,
            messages: [
              {
                role: "user",
                content: [
                  { type: "text", text: textPrompt },
                  {
                    type: "image",
                    image: bytes,
                    mediaType: opts.image.mediaType,
                  },
                ],
              },
            ],
          });
        }

        return generateObject({
          model,
          schema: explainSchema,
          temperature: 0,
          prompt: textPrompt,
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
        taskUsed: task,
      };
    }

    return {
      explanation: validated.sanitizedContent,
      notesCitations: [],
      webSources: [],
      explanationSource: "model",
      taskUsed: task,
    };
  } catch {
    const key = opts.correctKey ?? "?";
    return {
      explanation: `Correct option: ${key}. Review this concept in your notes and re-attempt similar questions.`,
      notesCitations: [],
      webSources: [],
      explanationSource: "none",
      taskUsed: task,
    };
  }
}

/**
 * Cross-check AI-solved answer keys (confidence < 1) via `explain` task.
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
    const modelId = getTaskModelId("explain");
    const result = await withAiUsage({
      userId: opts.userId,
      task: "explain",
      model: modelId,
      run: async () => {
        const model = getLanguageModel("explain");
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
