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

  if (chunks.length === 0 || bestScore < threshold) {
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
