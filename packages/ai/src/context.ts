import type { RetrievedChunk } from "./citations";

/**
 * Assemble grounded context blocks with stable machine citation ids.
 * The model must cite using [citation:documentId:page] which we validate.
 */
export function assembleContext(chunks: RetrievedChunk[]): string {
  if (chunks.length === 0) return "";

  return chunks
    .map((c, i) => {
      return [
        `### Chunk ${i + 1}`,
        `Title: ${c.title}`,
        `DocumentId: ${c.documentId}`,
        `Page: ${c.pageNumber}`,
        `Score: ${c.score.toFixed(4)}`,
        `Cite as: [citation:${c.documentId}:${c.pageNumber}] or [${c.title}, p. ${c.pageNumber}]`,
        "",
        c.text,
      ].join("\n");
    })
    .join("\n\n");
}

export function buildRagSystemPrompt(opts: {
  memoryFacts?: string[];
  context: string;
}): string {
  const memory =
    opts.memoryFacts && opts.memoryFacts.length > 0
      ? `## Known facts about this student (mem0)\n${opts.memoryFacts.map((f) => `- ${f}`).join("\n")}\n`
      : "";

  return `You are ExamGPT, a personal exam tutor for NEET/JEE students.

## Hard rules (never break)
1. Answer ONLY using the CONTEXT chunks below. Do not use parametric knowledge to fill gaps.
2. Every factual claim must include a citation marker: [Title, p. N] matching a chunk.
3. Prefer machine form [citation:DOCUMENT_ID:PAGE] when possible.
4. If CONTEXT is insufficient for the question, say so clearly — do not invent facts or page numbers.
5. Never invent document titles or page numbers that are not in CONTEXT.
6. Do not mix web knowledge into a notes-grounded answer.

${memory}
## CONTEXT (user's own notes)
${opts.context || "(no chunks retrieved)"}
`;
}

/** Score threshold for "enough evidence in notes". Cosine ~0.3–0.5 typical; RRF scores differ. */
export const DEFAULT_RETRIEVAL_SCORE_THRESHOLD = 0.12;
export const DEFAULT_TOP_K = 8;
