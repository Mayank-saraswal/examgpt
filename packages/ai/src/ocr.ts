import { generateObject } from "ai";
import { z } from "zod";
import { getModelConfig } from "./registry";
import { getLanguageModel } from "./providers";
import { withAiUsage } from "./usage";

const pageOcrSchema = z.object({
  classification: z.enum(["printed", "handwritten", "diagram", "mixed"]),
  hasHandwriting: z.boolean(),
  hasImages: z.boolean(),
  hasTables: z.boolean(),
  markdown: z
    .string()
    .describe(
      "Full page as markdown. Tables must be GFM pipe tables. Every figure/diagram must be a block like [FIGURE: detailed description]. Preserve reading order.",
    ),
});

export type PageOcrResult = z.infer<typeof pageOcrSchema>;

/**
 * OCR a single page (PDF bytes or image) via the model registry.
 * Provider-agnostic: uses getLanguageModel so AI_MODEL_OCR can switch
 * google → openai (or openrouter) without code changes.
 *
 * Content is passed as AI SDK multimodal parts (file / image).
 */
export async function ocrPage(opts: {
  data: Uint8Array | Buffer;
  mediaType: "application/pdf" | "image/png" | "image/jpeg" | "image/webp";
  pageNumber: number;
  userId?: string | null;
}): Promise<PageOcrResult> {
  const cfg = getModelConfig("ocr");
  const model = getLanguageModel("ocr");
  const bytes = Buffer.isBuffer(opts.data)
    ? opts.data
    : Buffer.from(opts.data);

  // OpenAI vision path prefers image/*; PDF file parts are unreliable on chat models.
  // For PDF pages on openai: send as file with filename when possible, else image.
  const mediaPart =
    cfg.provider === "openai" && opts.mediaType.startsWith("image/")
      ? ({
          type: "image" as const,
          image: bytes,
          mediaType: opts.mediaType,
        } as const)
      : cfg.provider === "openai" && opts.mediaType === "application/pdf"
        ? ({
            type: "file" as const,
            data: bytes,
            mediaType: "application/pdf" as const,
            filename: `page-${opts.pageNumber}.pdf`,
          } as const)
        : ({
            type: "file" as const,
            data: bytes,
            mediaType: opts.mediaType,
          } as const);

  const result = await withAiUsage({
    userId: opts.userId,
    task: "ocr",
    model: cfg.modelId,
    run: async () =>
      generateObject({
        model,
        schema: pageOcrSchema,
        temperature: 0,
        messages: [
          {
            role: "user",
            content: [
              {
                type: "text",
                text: `You are an exam-notes OCR engine. This is page ${opts.pageNumber} of a study document.

Rules:
1. Extract ALL readable text into clean markdown.
2. Preserve tables as GitHub-flavored markdown pipe tables (never as plain paragraphs).
3. For every diagram, chart, figure, or schematic, emit a block exactly like:
   [FIGURE: detailed description of what the figure shows, including labels and relationships]
4. Classify the page: printed | handwritten | diagram | mixed.
5. Set hasHandwriting / hasImages / hasTables accurately.
6. Do not invent content that is not on the page.`,
              },
              mediaPart,
            ],
          },
        ],
      }),
  });

  return result.object;
}
