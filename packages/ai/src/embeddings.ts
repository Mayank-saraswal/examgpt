import { createOpenAI } from "@ai-sdk/openai";
import { embed, embedMany } from "ai";
import { getModelConfig } from "./registry";
import { withAiUsage } from "./usage";

/** text-embedding-3-large default dimensions */
export const EMBEDDING_DIMENSIONS = 3072;

function requireOpenAiKey(): string {
  const key = process.env.OPENAI_API_KEY;
  if (!key) {
    throw new Error(
      "OPENAI_API_KEY is required for embeddings (packages/ai). Add it to .env",
    );
  }
  return key;
}

export function getEmbeddingModelId(): string {
  return getModelConfig("embedding").modelId;
}

export async function embedTexts(
  texts: string[],
  userId?: string | null,
): Promise<number[][]> {
  if (texts.length === 0) return [];
  const apiKey = requireOpenAiKey();
  const cfg = getModelConfig("embedding");
  if (cfg.provider !== "openai") {
    throw new Error(`embedding task must use openai provider, got ${cfg.provider}`);
  }
  const openai = createOpenAI({ apiKey });
  const model = openai.embedding(cfg.modelId);

  const result = await withAiUsage({
    userId,
    task: "embedding",
    model: cfg.modelId,
    run: async () =>
      embedMany({
        model,
        values: texts,
      }),
    extractUsage: (r) => ({
      tokensIn: r.usage?.tokens ?? texts.join(" ").length,
      tokensOut: 0,
    }),
  });
  return result.embeddings;
}

export async function embedText(
  text: string,
  userId?: string | null,
): Promise<number[]> {
  const apiKey = requireOpenAiKey();
  const cfg = getModelConfig("embedding");
  const openai = createOpenAI({ apiKey });
  const model = openai.embedding(cfg.modelId);
  const result = await withAiUsage({
    userId,
    task: "embedding",
    model: cfg.modelId,
    run: async () => embed({ model, value: text }),
    extractUsage: (r) => ({
      tokensIn: r.usage?.tokens ?? text.length,
      tokensOut: 0,
    }),
  });
  return result.embedding;
}

/**
 * Simple BM25-ish sparse bag-of-words for hybrid search.
 * Deterministic: same text → same indices/values.
 */
export function sparseEncode(text: string): { indices: number[]; values: number[] } {
  const tokens = text
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .split(/\s+/)
    .filter((t) => t.length > 1);

  const tf = new Map<number, number>();
  for (const t of tokens) {
    // FNV-1a 32-bit → positive index space
    let h = 2166136261;
    for (let i = 0; i < t.length; i++) {
      h ^= t.charCodeAt(i);
      h = Math.imul(h, 16777619);
    }
    const idx = h >>> 0;
    tf.set(idx, (tf.get(idx) ?? 0) + 1);
  }

  const indices = [...tf.keys()].sort((a, b) => a - b);
  const values = indices.map((i) => {
    const f = tf.get(i) ?? 0;
    // log TF
    return 1 + Math.log(f);
  });
  return { indices, values };
}
