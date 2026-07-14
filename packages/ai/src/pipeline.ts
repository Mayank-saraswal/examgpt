import {
  notInNotesResult,
  generateClarifyingQuestion,
  streamNotesAnswer,
  generateWebAnswer,
  type RagAnswerResult,
} from "./answer";
import type { RetrievedChunk } from "./citations";
import {
  DEFAULT_RETRIEVAL_SCORE_THRESHOLD,
} from "./context";
import { isQueryVagueHeuristic, rewriteQuery } from "./rewrite";
import { memoryFactsToStrings, searchMemories } from "./memory";

export type HybridSearchFn = (opts: {
  userId: string;
  query: string;
  hydePassage: string;
  topK: number;
}) => Promise<RetrievedChunk[]>;

const STOP = new Set([
  "what",
  "which",
  "where",
  "when",
  "how",
  "does",
  "that",
  "this",
  "with",
  "from",
  "your",
  "notes",
  "about",
  "into",
  "have",
  "should",
  "would",
  "could",
  "the",
  "and",
  "for",
  "are",
  "was",
  "were",
  "explain",
  "detail",
  "according",
  "please",
  "tell",
  "give",
]);

/** True if query tokens (len>3, non-stop) appear in top retrieved chunks. */
export function chunksHaveLexicalSupport(
  query: string,
  rewritten: string,
  chunks: RetrievedChunk[],
  minHits = 1,
): boolean {
  if (chunks.length === 0) return false;
  const tokens = `${query} ${rewritten}`
    .toLowerCase()
    .split(/[^a-z0-9]+/i)
    .filter((t) => t.length > 3 && !STOP.has(t));
  if (tokens.length === 0) return true; // can't judge — defer to score threshold
  const corpus = chunks
    .slice(0, 4)
    .map((c) => `${c.title} ${c.text}`.toLowerCase())
    .join("\n");
  let hits = 0;
  for (const t of tokens) {
    if (corpus.includes(t)) hits++;
  }
  // Require either 2 hits or ≥30% of content tokens
  return hits >= Math.max(minHits, Math.ceil(tokens.length * 0.3));
}

export type RunRagOptions = {
  userId: string;
  query: string;
  /** When true, skip notes and run web-search path. */
  forceWeb?: boolean;
  scoreThreshold?: number;
  topK?: number;
  search: HybridSearchFn;
  onToken?: (delta: string) => void;
  signal?: AbortSignal;
};

export type RunRagMeta = {
  rewritten: string;
  bestScore: number;
  chunkCount: number;
  isVague: boolean;
};

/**
 * Full RAG decision tree:
 * rewrite → hybrid search → threshold → notes answer | clarifying | not_in_notes
 * forceWeb → web answer (never mixes with notes citations)
 */
export async function runRagPipeline(
  opts: RunRagOptions,
): Promise<RagAnswerResult & { meta: RunRagMeta }> {
  const threshold = opts.scoreThreshold ?? DEFAULT_RETRIEVAL_SCORE_THRESHOLD;
  const topK = opts.topK ?? 8;

  if (opts.forceWeb) {
    const web = await generateWebAnswer({
      query: opts.query,
      onToken: opts.onToken,
      signal: opts.signal,
      userId: opts.userId,
    });
    return {
      ...web,
      meta: {
        rewritten: opts.query,
        bestScore: 0,
        chunkCount: 0,
        isVague: false,
      },
    };
  }

  const rewrite = await rewriteQuery(opts.query, opts.userId);
  const chunks = await opts.search({
    userId: opts.userId,
    query: rewrite.rewritten,
    hydePassage: rewrite.hydePassage,
    topK,
  });

  const bestScore = chunks[0]?.score ?? 0;
  const isVague = rewrite.isVague || isQueryVagueHeuristic(opts.query);
  const meta: RunRagMeta = {
    rewritten: rewrite.rewritten,
    bestScore,
    chunkCount: chunks.length,
    isVague,
  };

  // Lexical gate: RRF can rank weakly-related chunks highly for off-topic
  // queries (movies, software, personal data). Require token overlap with
  // retrieved text so we never invent notes-grounded answers.
  const hasLexicalSupport = chunksHaveLexicalSupport(
    opts.query,
    rewrite.rewritten,
    chunks,
  );

  if (
    chunks.length === 0 ||
    bestScore < threshold ||
    !hasLexicalSupport
  ) {
    if (isVague && chunks.length > 0 && bestScore < threshold) {
      const q = await generateClarifyingQuestion(opts.query, opts.userId);
      return {
        kind: "clarifying",
        content: q,
        citations: [],
        webSources: [],
        strippedCitationCount: 0,
        meta,
      };
    }
    // Off-topic with no lexical support → not_in_notes, unless query is vague
    // (then ask one clarifying question per product rules).
    if (isVague) {
      const q = await generateClarifyingQuestion(opts.query, opts.userId);
      return {
        kind: "clarifying",
        content: q,
        citations: [],
        webSources: [],
        strippedCitationCount: 0,
        meta,
      };
    }
    return { ...notInNotesResult(), meta };
  }

  const facts = await searchMemories(opts.userId, opts.query);
  const memoryFacts = memoryFactsToStrings(facts);

  const answer = await streamNotesAnswer({
    query: opts.query,
    chunks,
    memoryFacts,
    onToken: opts.onToken,
    signal: opts.signal,
    userId: opts.userId,
  });

  return { ...answer, meta };
}
