import {
  EMBEDDING_DIMENSIONS,
  embedText,
  embedTexts,
  getEmbeddingModelId,
  isNearDuplicate,
  sparseEncode,
} from "@examgpt/ai";
import {
  DENSE_VECTOR_NAME,
  getQdrant,
  SPARSE_VECTOR_NAME,
} from "./client";
import { logger } from "../logger";
import { questionBankPointId } from "./question-bank-ids";

export { questionBankPointId } from "./question-bank-ids";

export const QUESTION_BANK_COLLECTION = "question_bank";

/** Dedupe threshold for near-identical stems (cosine) */
export const QUESTION_DEDUPE_THRESHOLD = 0.88;

export type QuestionBankPayload = {
  userId: string;
  testId: string;
  questionIndex: number;
  topic: string;
  text: string;
  wasCorrect: boolean | null;
  _meta?: boolean;
  /** true when generated without notes grounding */
  fromSyllabusOnly?: boolean;
};

export type QuestionBankItem = {
  userId: string;
  testId: string;
  questionIndex: number;
  topic: string;
  text: string;
  wasCorrect?: boolean | null;
  fromSyllabusOnly?: boolean;
};

/**
 * Ensure question_bank with dense + sparse named vectors, userId index,
 * embedding model metadata. Recreates collection if schema is missing sparse
 * (dev-safe; run backfill script after).
 */
export async function ensureQuestionBankCollection(): Promise<void> {
  const q = getQdrant();
  const modelId = getEmbeddingModelId();
  const collections = await q.getCollections();
  const exists = collections.collections.some(
    (c) => c.name === QUESTION_BANK_COLLECTION,
  );

  if (exists) {
    try {
      const info = await q.getCollection(QUESTION_BANK_COLLECTION);
      const sparse = info.config?.params?.sparse_vectors;
      const hasSparse =
        sparse != null &&
        typeof sparse === "object" &&
        SPARSE_VECTOR_NAME in (sparse as object);
      if (!hasSparse) {
        logger.warn(
          "question_bank missing sparse vectors — recreating collection",
        );
        await q.deleteCollection(QUESTION_BANK_COLLECTION);
      } else {
        logger.info(
          { collection: QUESTION_BANK_COLLECTION, modelId },
          "Qdrant question_bank ready",
        );
        return;
      }
    } catch {
      // fall through to create
    }
  }

  await q.createCollection(QUESTION_BANK_COLLECTION, {
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
  await q.createPayloadIndex(QUESTION_BANK_COLLECTION, {
    field_name: "userId",
    field_schema: "keyword",
  });
  await q.createPayloadIndex(QUESTION_BANK_COLLECTION, {
    field_name: "testId",
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
    { collection: QUESTION_BANK_COLLECTION, modelId },
    "Created question_bank collection (dense+sparse)",
  );
}

export async function upsertQuestionBankItems(
  items: QuestionBankItem[],
  denseVectors?: number[][],
): Promise<number> {
  if (items.length === 0) return 0;
  await ensureQuestionBankCollection();
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
  const points = items.map((item, i) => {
    const sparse = sparseEncode(item.text);
    const payload: QuestionBankPayload = {
      userId: item.userId,
      testId: item.testId,
      questionIndex: item.questionIndex,
      topic: item.topic || "Untagged",
      text: item.text.slice(0, 4000),
      wasCorrect: item.wasCorrect ?? null,
      fromSyllabusOnly: item.fromSyllabusOnly ?? false,
      _meta: false,
    };
    return {
      id: questionBankPointId(item.testId, item.questionIndex),
      vector: {
        [DENSE_VECTOR_NAME]: vectors[i]!,
        [SPARSE_VECTOR_NAME]: {
          indices: sparse.indices,
          values: sparse.values,
        },
      },
      payload,
    };
  });

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
 * Update wasCorrect on an existing bank point (after grading).
 * Idempotent set_payload by deterministic id.
 */
export async function updateQuestionBankWasCorrect(opts: {
  testId: string;
  questionIndex: number;
  wasCorrect: boolean | null;
}): Promise<boolean> {
  const id = questionBankPointId(opts.testId, opts.questionIndex);
  try {
    const q = getQdrant();
    await q.setPayload(QUESTION_BANK_COLLECTION, {
      wait: true,
      payload: { wasCorrect: opts.wasCorrect },
      points: [id],
    });
    return true;
  } catch (err) {
    logger.warn(
      { err, testId: opts.testId, questionIndex: opts.questionIndex },
      "question_bank wasCorrect update failed",
    );
    return false;
  }
}

/** Batch wasCorrect updates for an attempt's responses */
export async function updateQuestionBankCorrectnessFromResponses(opts: {
  testId: string;
  responses: { questionIndex: number; isCorrect: boolean | null }[];
}): Promise<number> {
  let n = 0;
  for (const r of opts.responses) {
    const ok = await updateQuestionBankWasCorrect({
      testId: opts.testId,
      questionIndex: r.questionIndex,
      wasCorrect: r.isCorrect,
    });
    if (ok) n += 1;
  }
  return n;
}

/**
 * Per-topic accuracy from question_bank for a user (for adaptive weighting).
 */
export async function topicAccuracyFromQuestionBank(
  userId: string,
  limit = 500,
): Promise<Map<string, { correct: number; total: number; accuracy: number }>> {
  const map = new Map<
    string,
    { correct: number; total: number; accuracy: number }
  >();
  try {
    await ensureQuestionBankCollection();
    const q = getQdrant();
    let offset: string | number | Record<string, unknown> | null | undefined =
      undefined;
    let fetched = 0;
    while (fetched < limit) {
      const page = await q.scroll(QUESTION_BANK_COLLECTION, {
        filter: {
          must: [{ key: "userId", match: { value: userId } }],
          must_not: [{ key: "_meta", match: { value: true } }],
        },
        limit: Math.min(100, limit - fetched),
        offset: offset ?? undefined,
        with_payload: true,
        with_vector: false,
      });
      for (const p of page.points) {
        const pl = p.payload as QuestionBankPayload | undefined;
        if (!pl?.topic) continue;
        if (pl.wasCorrect === null || pl.wasCorrect === undefined) continue;
        const cur = map.get(pl.topic) ?? { correct: 0, total: 0, accuracy: 0 };
        cur.total += 1;
        if (pl.wasCorrect) cur.correct += 1;
        cur.accuracy = cur.total > 0 ? cur.correct / cur.total : 0;
        map.set(pl.topic, cur);
      }
      fetched += page.points.length;
      offset = page.next_page_offset as typeof offset;
      if (offset == null || page.points.length === 0) break;
    }
  } catch (err) {
    logger.warn({ err }, "topicAccuracyFromQuestionBank failed");
  }
  return map;
}

export async function isDuplicateInQuestionBank(opts: {
  userId: string;
  stem: string;
  denseVector?: number[];
  threshold?: number;
}): Promise<boolean> {
  const threshold = opts.threshold ?? QUESTION_DEDUPE_THRESHOLD;
  try {
    await ensureQuestionBankCollection();
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

export { isNearDuplicate };
