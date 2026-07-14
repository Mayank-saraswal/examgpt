import { createHash } from "node:crypto";
import type { TextChunk } from "@examgpt/ai";
import {
  DENSE_VECTOR_NAME,
  SPARSE_VECTOR_NAME,
  STUDY_CHUNKS_COLLECTION,
  getQdrant,
} from "./client";
import { sparseEncode } from "@examgpt/ai";

/**
 * Deterministic UUID for a chunk — retries/upserts do not create duplicates.
 * Format: UUIDv5-like from SHA-1 of documentId:page:chunkIndex.
 */
export function chunkPointId(
  documentId: string,
  pageNumber: number,
  chunkIndex: number,
): string {
  const h = createHash("sha1")
    .update(`${documentId}:${pageNumber}:${chunkIndex}`)
    .digest();
  // Format as UUID: 8-4-4-4-12
  const hex = h.subarray(0, 16).toString("hex");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20, 32)}`;
}

export type StudyChunkPayload = {
  userId: string;
  documentId: string;
  title: string;
  pageNumber: number;
  chunkIndex: number;
  topic?: string;
  hasImage: boolean;
  text: string;
  _meta?: boolean;
};

export async function upsertStudyChunks(opts: {
  userId: string;
  documentId: string;
  title: string;
  chunks: TextChunk[];
  denseVectors: number[][];
}): Promise<number> {
  if (opts.chunks.length !== opts.denseVectors.length) {
    throw new Error("chunks and denseVectors length mismatch");
  }
  const q = getQdrant();
  const points = opts.chunks.map((chunk, i) => {
    const sparse = sparseEncode(chunk.text);
    const payload: StudyChunkPayload = {
      userId: opts.userId,
      documentId: opts.documentId,
      title: opts.title,
      pageNumber: chunk.pageNumber,
      chunkIndex: chunk.chunkIndex,
      hasImage: chunk.hasImage,
      text: chunk.text,
    };
    return {
      id: chunkPointId(opts.documentId, chunk.pageNumber, chunk.chunkIndex),
      vector: {
        [DENSE_VECTOR_NAME]: opts.denseVectors[i]!,
        [SPARSE_VECTOR_NAME]: {
          indices: sparse.indices,
          values: sparse.values,
        },
      },
      payload,
    };
  });

  // Batch upserts of 64
  const batchSize = 64;
  for (let i = 0; i < points.length; i += batchSize) {
    const batch = points.slice(i, i + batchSize);
    await q.upsert(STUDY_CHUNKS_COLLECTION, { wait: true, points: batch });
  }
  return points.length;
}

/** Delete all study chunks for a document (user-scoped). */
export async function deleteDocumentChunks(
  userId: string,
  documentId: string,
): Promise<void> {
  const q = getQdrant();
  await q.delete(STUDY_CHUNKS_COLLECTION, {
    wait: true,
    filter: {
      must: [
        { key: "userId", match: { value: userId } },
        { key: "documentId", match: { value: documentId } },
      ],
    },
  });
}
