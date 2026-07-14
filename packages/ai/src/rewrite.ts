import { generateText } from "ai";
import { z } from "zod";
import { getLanguageModel, getTaskModelId } from "./providers";
import { withAiUsage } from "./usage";

export const rewriteResultSchema = z.object({
  rewritten: z.string(),
  hydePassage: z.string(),
  isVague: z.boolean(),
});

export type RewriteResult = z.infer<typeof rewriteResultSchema>;

/**
 * Query rewrite + HyDE-style hypothetical passage for better retrieval.
 * Falls back to the original query if the model fails.
 */
export async function rewriteQuery(
  query: string,
  userId?: string | null,
): Promise<RewriteResult> {
  const trimmed = query.trim();
  if (trimmed.length < 2) {
    return {
      rewritten: trimmed,
      hydePassage: trimmed,
      isVague: true,
    };
  }

  const wordCount = trimmed.split(/\s+/).filter(Boolean).length;
  const looksVague =
    wordCount <= 4 ||
    /^(explain|what|that|this|force|thing|concept|help|idk|something)\b/i.test(
      trimmed,
    );

  try {
    const modelId = getTaskModelId("chat-rag");
    const result = await withAiUsage({
      userId,
      task: "chat-rag",
      model: modelId,
      run: async () => {
        const model = getLanguageModel("chat-rag");
        return generateText({
          model,
          temperature: 0,
          prompt: `You help retrieval for an exam tutor (NEET/JEE).
Given the student query, output JSON only (no markdown):
{"rewritten":"clear English search query","hydePassage":"2-4 sentence hypothetical answer paragraph rich in exam terms","isVague":true|false}

Rules:
- rewritten expands abbreviations and fixes spelling for physics/chem/bio/math.
- hydePassage is what a correct textbook snippet might say (for embedding), not a real answer claim.
- isVague=true if the query is ambiguous and needs one clarifying question.

Query: ${JSON.stringify(trimmed)}`,
        });
      },
    });

    const jsonMatch = result.text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) throw new Error("no json");
    return rewriteResultSchema.parse(JSON.parse(jsonMatch[0]));
  } catch {
    return {
      rewritten: trimmed,
      hydePassage: trimmed,
      isVague: looksVague,
    };
  }
}

export function isQueryVagueHeuristic(query: string): boolean {
  const trimmed = query.trim();
  const wordCount = trimmed.split(/\s+/).filter(Boolean).length;
  return (
    wordCount <= 4 ||
    /^(explain|what about|that|this|the|force thing|help me|idk)\b/i.test(
      trimmed,
    )
  );
}
