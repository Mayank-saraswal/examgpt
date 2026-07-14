import {
  embedText,
  reciprocalRankFusion,
  sparseEncode,
  type RetrievedChunk,
} from "@examgpt/ai";
import {
  DENSE_VECTOR_NAME,
  SPARSE_VECTOR_NAME,
  STUDY_CHUNKS_COLLECTION,
  getQdrant,
} from "./client";

type ScoredHit = {
  id: string;
  score: number;
  payload: Record<string, unknown>;
};

/**
 * Hybrid dense + sparse search with RRF fusion.
 * ALWAYS filters by userId; always excludes _meta points.
 */
export async function hybridSearchStudyChunks(opts: {
  userId: string;
  query: string;
  hydePassage?: string;
  topK?: number;
}): Promise<RetrievedChunk[]> {
  const topK = opts.topK ?? 8;
  const q = getQdrant();

  const denseQueryText = opts.hydePassage?.trim()
    ? `${opts.query}\n${opts.hydePassage}`
    : opts.query;

  const [denseVec, sparse] = await Promise.all([
    embedText(denseQueryText),
    Promise.resolve(sparseEncode(opts.query)),
  ]);

  const filter = {
    must: [{ key: "userId", match: { value: opts.userId } }],
    must_not: [{ key: "_meta", match: { value: true } }],
  };

  const [denseRes, sparseRes] = await Promise.all([
    q.search(STUDY_CHUNKS_COLLECTION, {
      vector: { name: DENSE_VECTOR_NAME, vector: denseVec },
      limit: topK * 2,
      filter,
      with_payload: true,
    }),
    q.search(STUDY_CHUNKS_COLLECTION, {
      vector: {
        name: SPARSE_VECTOR_NAME,
        vector: {
          indices: sparse.indices,
          values: sparse.values,
        },
      },
      limit: topK * 2,
      filter,
      with_payload: true,
    }),
  ]);

  const toHit = (r: {
    id: string | number;
    score?: number;
    payload?: Record<string, unknown> | null;
  }): ScoredHit => ({
    id: String(r.id),
    score: r.score ?? 0,
    payload: (r.payload ?? {}) as Record<string, unknown>,
  });

  const denseHits = denseRes.map(toHit);
  const sparseHits = sparseRes.map(toHit);

  const fused = reciprocalRankFusion(
    [
      denseHits.map((h) => ({ id: h.id, hit: h })),
      sparseHits.map((h) => ({ id: h.id, hit: h })),
    ],
    60,
  );

  // Prefer dense cosine score when available for thresholding
  const denseScoreById = new Map(denseHits.map((h) => [h.id, h.score]));

  const chunks: RetrievedChunk[] = [];
  for (const f of fused.slice(0, topK)) {
    const hit = f.item.hit;
    const p = hit.payload;
    if (p._meta === true) continue;
    const documentId = String(p.documentId ?? "");
    const title = String(p.title ?? "Document");
    const pageNumber = Number(p.pageNumber ?? 0);
    const text = String(p.text ?? "");
    if (!documentId || !pageNumber || !text) continue;

    const denseScore = denseScoreById.get(hit.id) ?? f.score;
    chunks.push({
      documentId,
      title,
      pageNumber,
      chunkId: hit.id,
      text,
      // Use dense cosine when present (0–1-ish); fall back to RRF
      score: denseScore,
    });
  }

  return chunks;
}
