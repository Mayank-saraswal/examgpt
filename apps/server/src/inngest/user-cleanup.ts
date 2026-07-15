/**
 * Phase 7 — full account deletion cleanup.
 * Triggered by Clerk user.deleted webhook (or user.deleteAccount).
 * Removes: DB rows (cascade), Qdrant study_chunks + question_bank, local/R2 files, mem0.
 */
import { db } from "@examgpt/db";
import { inngest } from "./client";
import { getQdrant, STUDY_CHUNKS_COLLECTION, QUESTION_BANK_COLLECTION } from "../qdrant/client";
import { createStorage } from "../storage";
import { logger } from "../logger";

export const userCleanup = inngest.createFunction(
  {
    id: "user-cleanup",
    retries: 3,
    concurrency: { limit: 2 },
  },
  { event: "user/deleted" },
  async ({ event, step }) => {
    const data = event.data as { userId: string; fileKeys?: string[] };
    const { userId } = data;
    if (!userId || typeof userId !== "string") {
      throw new Error("user/deleted missing userId");
    }

    // 1) File keys — prefer payload (caller may have already cascade-deleted User)
    const fileKeys = await step.run("list-file-keys", async () => {
      if (Array.isArray(data.fileKeys) && data.fileKeys.length > 0) {
        return data.fileKeys.filter((k) => typeof k === "string" && k.length > 0);
      }
      const docs = await db.document.findMany({
        where: { userId },
        select: { fileKey: true },
      });
      return docs.map((d) => d.fileKey).filter((k): k is string => Boolean(k));
    });

    // 2) Qdrant study_chunks
    await step.run("qdrant-study-chunks", async () => {
      try {
        const q = getQdrant();
        await q.delete(STUDY_CHUNKS_COLLECTION, {
          wait: true,
          filter: {
            must: [{ key: "userId", match: { value: userId } }],
          },
        });
      } catch (err) {
        logger.warn({ err, userId }, "Qdrant study_chunks delete failed");
      }
    });

    // 3) Qdrant question_bank
    await step.run("qdrant-question-bank", async () => {
      try {
        const q = getQdrant();
        await q.delete(QUESTION_BANK_COLLECTION, {
          wait: true,
          filter: {
            must: [{ key: "userId", match: { value: userId } }],
          },
        });
      } catch (err) {
        logger.warn({ err, userId }, "Qdrant question_bank delete failed");
      }
    });

    // 4) Object storage (R2 or local)
    await step.run("storage-delete", async () => {
      const storage = createStorage();
      if (!storage?.deleteObject) return { deleted: 0 };
      let deleted = 0;
      for (const key of fileKeys) {
        try {
          await storage.deleteObject(key);
          deleted += 1;
        } catch (err) {
          logger.warn({ err, key, userId }, "storage delete failed");
        }
      }
      return { deleted };
    });

    // 5) mem0 memories (best-effort)
    await step.run("mem0-delete", async () => {
      const key = process.env.MEM0_API_KEY;
      if (!key) return { skipped: true as const };
      try {
        // mem0 v2 delete-all for user
        const res = await fetch(
          `https://api.mem0.ai/v1/memories/?user_id=${encodeURIComponent(userId)}`,
          {
            method: "DELETE",
            headers: { Authorization: `Token ${key}` },
          },
        );
        return { status: res.status, ok: res.ok };
      } catch (err) {
        logger.warn({ err, userId }, "mem0 delete failed");
        return { error: String(err) };
      }
    });

    // 6) Postgres — cascade via User delete (if still present)
    await step.run("db-delete", async () => {
      await db.user.deleteMany({ where: { id: userId } });
      // Orphan guard: usage logs already SetNull on user delete
      return { ok: true as const };
    });

    logger.info({ userId, fileKeys: fileKeys.length }, "user cleanup complete");
    return { ok: true, userId, files: fileKeys.length };
  },
);
