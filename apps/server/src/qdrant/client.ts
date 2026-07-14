import { QdrantClient } from "@qdrant/js-client-rest";
import {
  EMBEDDING_DIMENSIONS,
  getEmbeddingModelId,
} from "@examgpt/ai";
import { env } from "../env";
import { logger } from "../logger";

export const STUDY_CHUNKS_COLLECTION = "study_chunks";
export const DENSE_VECTOR_NAME = "dense";
export const SPARSE_VECTOR_NAME = "sparse";

let client: QdrantClient | null = null;

export function getQdrant(): QdrantClient {
  if (!client) {
    if (!env.QDRANT_URL) {
      throw new Error("QDRANT_URL is required");
    }
    client = new QdrantClient({
      url: env.QDRANT_URL,
      apiKey: env.QDRANT_API_KEY,
    });
  }
  return client;
}

/**
 * Ensure study_chunks exists with dense + sparse named vectors,
 * userId payload index, and embedding model metadata asserted.
 * @see https://qdrant.tech/documentation/concepts/collections/
 */
export async function ensureStudyChunksCollection(): Promise<void> {
  const q = getQdrant();
  const modelId = getEmbeddingModelId();
  const collections = await q.getCollections();
  const exists = collections.collections.some(
    (c) => c.name === STUDY_CHUNKS_COLLECTION,
  );

  if (!exists) {
    await q.createCollection(STUDY_CHUNKS_COLLECTION, {
      vectors: {
        [DENSE_VECTOR_NAME]: {
          size: EMBEDDING_DIMENSIONS,
          distance: "Cosine",
        },
      },
      sparse_vectors: {
        [SPARSE_VECTOR_NAME]: {},
      },
    });
    await q.createPayloadIndex(STUDY_CHUNKS_COLLECTION, {
      field_name: "userId",
      field_schema: "keyword",
    });
    await q.createPayloadIndex(STUDY_CHUNKS_COLLECTION, {
      field_name: "documentId",
      field_schema: "keyword",
    });
    // Store model id in collection metadata via alias payload on a meta point is awkward;
    // use collection-level via set payload on a reserved meta point OR update aliases.
    // Qdrant supports collection metadata via `metadata` in some versions — use a meta point.
    await q.upsert(STUDY_CHUNKS_COLLECTION, {
      wait: true,
      points: [
        {
          id: "00000000-0000-4000-8000-000000000001",
          vector: {
            [DENSE_VECTOR_NAME]: new Array(EMBEDDING_DIMENSIONS).fill(0),
            [SPARSE_VECTOR_NAME]: { indices: [0], values: [1] },
          },
          payload: {
            _meta: true,
            embeddingModel: modelId,
            embeddingDimensions: EMBEDDING_DIMENSIONS,
          },
        },
      ],
    });
    logger.info(
      { collection: STUDY_CHUNKS_COLLECTION, modelId },
      "Created study_chunks collection",
    );
    return;
  }

  // Assert embedding model matches frozen model in metadata
  const meta = await q.retrieve(STUDY_CHUNKS_COLLECTION, {
    ids: ["00000000-0000-4000-8000-000000000001"],
    with_payload: true,
  });
  const stored = meta[0]?.payload?.embeddingModel as string | undefined;
  if (stored && stored !== modelId) {
    throw new Error(
      `Embedding model mismatch: collection has "${stored}" but registry is "${modelId}". Re-embed required before switching models.`,
    );
  }
  if (!stored) {
    // Backfill meta point
    await q.upsert(STUDY_CHUNKS_COLLECTION, {
      wait: true,
      points: [
        {
          id: "00000000-0000-4000-8000-000000000001",
          vector: {
            [DENSE_VECTOR_NAME]: new Array(EMBEDDING_DIMENSIONS).fill(0),
            [SPARSE_VECTOR_NAME]: { indices: [0], values: [1] },
          },
          payload: {
            _meta: true,
            embeddingModel: modelId,
            embeddingDimensions: EMBEDDING_DIMENSIONS,
          },
        },
      ],
    });
  }

  logger.info({ collection: STUDY_CHUNKS_COLLECTION, modelId }, "Qdrant study_chunks ready");
}
