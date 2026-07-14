import { createHash } from "node:crypto";
import {
  EMBEDDING_DIMENSIONS,
  embedText,
  embedTexts,
  getEmbeddingModelId,
  isNearDuplicate,
} from "@examgpt/ai";
import {
  DENSE_VECTOR_NAME,
  getQdrant,
  SPARSE_VECTOR_NAME,
} from "./client";
import { logger } from "../logger";

export const QUESTION_BANK_COLLECTION = "question_bank";

/** Dedupe threshold for near-identical stems */
export const QUESTION_DEDUPE_THRESHOLD = 0.88;

export function questionBankPointId(
  userId: string,
  stem: string,
): string {
  const norm = stem.toLowerCase().replace(/\s+/g, " ").trim().slice(0, 2000);
  const h = createHash("sha1").update(`${userId}:${norm}`).digest();
  const hex = h.subarray(0, 16).toString("hex");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20, 32)}`;
}

export async function ensureQuestionBankCollection(): Promise<void> {
  const q = getQdrant();
  const modelId = getEmbeddingModelId();
  const collections = await q.getCollections();
  const exists = collections.collections.some(
    (c) => c.name === QUESTION_BANK_COLLECTION,
  );

  if (!exists) {
    await q.createCollection(QUESTION_BANK_COLLECTION, {
      vectors: {
        [DENSE_VECTOR_NAME]: {
          size: EMBEDDING_DIMENSIONS,
          distance: "Cosine",
        },
      },
    });
    await q.createPayloadIndex(QUESTION_BANK_COLLECTION, {
      field_name: "userId",
      field_schema: "keyword",
    });
    await q.createPayloadIndex(QUESTION_BANK_COLLECTION, {
      field_name: "topic",
      field_schema: "keyword",
    });
    await q.upsert(QUESTION_BANK_COLLECTION, {
      wait: true,
      points: [
        {
          id: "00000000-0000-4000-8000-0000000000b1",
          vector: {
            [DENSE_VECTOR_NAME]: new Array(EMBEDDING_DIMENSIONS).fill(0),
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
      { collection: QUESTION_BANK_COLLECTION, modelId },
      "Created question_bank collection",
    );
    return;
  }

  logger.info(
    { collection: QUESTION_BANK_COLLECTION, modelId },
    "Qdrant question_bank ready",
  );
}

export type QuestionBankItem = {
  userId: string;
  testId: string;
  questionIndex: number;
  topic: string;
  text: string;
  wasCorrect?: boolean | null;
};

export async function upsertQuestionBankItems(
  items: QuestionBankItem[],
  denseVectors?: number[][],
): Promise<number> {
  if (items.length === 0) return 0;
  const vectors =
    denseVectors ??
    (await embedTexts(
      items.map((i) => i.text),
      items[0]?.userId,
    ));
  if (vectors.length !== items.length) {
    throw new Error("question bank vectors length mismatch");
  }
  const q = getQdrant();
  const points = items.map((item, i) => ({
    id: questionBankPointId(item.userId, item.text),
    vector: {
      [DENSE_VECTOR_NAME]: vectors[i]!,
    },
    payload: {
      userId: item.userId,
      testId: item.testId,
      questionIndex: item.questionIndex,
      topic: item.topic,
      text: item.text.slice(0, 4000),
      wasCorrect: item.wasCorrect ?? null,
      _meta: false,
    },
  }));

  const batchSize = 64;
  for (let i = 0; i < points.length; i += batchSize) {
    await q.upsert(QUESTION_BANK_COLLECTION, {
      wait: true,
      points: points.slice(i, i + batchSize),
    });
  }
  return points.length;
}

/**
 * Search user's question bank for near-duplicates of `stem`.
 * Returns true if any hit score ≥ threshold (Qdrant cosine score).
 */
export async function isDuplicateInQuestionBank(opts: {
  userId: string;
  stem: string;
  denseVector?: number[];
  threshold?: number;
}): Promise<boolean> {
  const threshold = opts.threshold ?? QUESTION_DEDUPE_THRESHOLD;
  try {
    const vec =
      opts.denseVector ?? (await embedText(opts.stem, opts.userId));
    const q = getQdrant();
    const hits = await q.search(QUESTION_BANK_COLLECTION, {
      vector: { name: DENSE_VECTOR_NAME, vector: vec },
      limit: 5,
      filter: {
        must: [{ key: "userId", match: { value: opts.userId } }],
        must_not: [{ key: "_meta", match: { value: true } }],
      },
      with_payload: false,
      score_threshold: threshold,
    });
    return hits.length > 0;
  } catch (err) {
    logger.warn({ err }, "question_bank dedupe search failed — allowing");
    return false;
  }
}

/** Fetch top bank vectors for batch offline dedupe (optional) */
export async function fetchUserQuestionVectors(
  userId: string,
  limit = 200,
): Promise<number[][]> {
  try {
    const q = getQdrant();
    const scroll = await q.scroll(QUESTION_BANK_COLLECTION, {
      filter: {
        must: [{ key: "userId", match: { value: userId } }],
        must_not: [{ key: "_meta", match: { value: true } }],
      },
      limit,
      with_vector: true,
      with_payload: false,
    });
    const out: number[][] = [];
    for (const p of scroll.points) {
      const v = p.vector;
      if (v && typeof v === "object" && !Array.isArray(v)) {
        const named = (v as Record<string, number[]>)[DENSE_VECTOR_NAME];
        if (Array.isArray(named)) out.push(named);
      } else if (Array.isArray(v)) {
        out.push(v as number[]);
      }
    }
    return out;
  } catch {
    return [];
  }
}

export { isNearDuplicate };
