import { createGoogleGenerativeAI } from "@ai-sdk/google";
import { generateObject } from "ai";
import { z } from "zod";
import { getModelConfig } from "./registry";
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

function requireGoogleKey(): string {
  const key = process.env.GOOGLE_GENERATIVE_AI_API_KEY;
  if (!key) {
    throw new Error(
      "GOOGLE_GENERATIVE_AI_API_KEY is required for OCR (packages/ai). Add it to .env",
    );
  }
  return key;
}

/**
 * OCR a single page (PDF bytes or image) via Gemini through the model registry.
 * @see https://ai-sdk.dev/providers/ai-sdk-providers/google-generative-ai
 */
export async function ocrPage(opts: {
  data: Uint8Array | Buffer;
  mediaType: "application/pdf" | "image/png" | "image/jpeg" | "image/webp";
  pageNumber: number;
  userId?: string | null;
}): Promise<PageOcrResult> {
  const apiKey = requireGoogleKey();
  const cfg = getModelConfig("ocr");
  if (cfg.provider !== "google") {
    throw new Error(`OCR task must use google provider, got ${cfg.provider}`);
  }

  const google = createGoogleGenerativeAI({ apiKey });
  const model = google(cfg.modelId);

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
              {
                type: "file",
                data: opts.data,
                mediaType: opts.mediaType,
              },
            ],
          },
        ],
      }),
  });

  return result.object;
}
