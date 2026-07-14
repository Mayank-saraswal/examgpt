import { createHash } from "node:crypto";
import {
  chunkPages,
  embedTexts,
  ocrPage,
  type PageInput,
} from "@examgpt/ai";
import { db } from "@examgpt/db";
import { inngest } from "./client";
import { splitPdfPages } from "../pdf/split";
import { fetchRemotePdf } from "../storage/fetch-url";
import {
  createStorage,
  readLocalObject,
  writeLocalObject,
  storageBackend,
} from "../storage";
import { deleteDocumentChunks, upsertStudyChunks } from "../qdrant/points";
import { ensureStudyChunksCollection } from "../qdrant/client";
import { logger } from "../logger";
import { GetObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { env } from "../env";

async function downloadDocumentBytes(fileKey: string): Promise<Buffer> {
  // Local filesystem first (dev fallback / verification scripts)
  const local = await readLocalObject(fileKey);
  if (local) return local;

  if (
    !env.R2_ACCOUNT_ID ||
    !env.R2_ACCESS_KEY_ID ||
    !env.R2_SECRET_ACCESS_KEY ||
    !env.R2_BUCKET
  ) {
    throw new Error(
      "Document bytes not found locally and R2 is not configured",
    );
  }
  try {
    const client = new S3Client({
      region: "auto",
      endpoint: `https://${env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
      credentials: {
        accessKeyId: env.R2_ACCESS_KEY_ID,
        secretAccessKey: env.R2_SECRET_ACCESS_KEY,
      },
    });
    const res = await client.send(
      new GetObjectCommand({ Bucket: env.R2_BUCKET, Key: fileKey }),
    );
    const body = res.Body;
    if (!body) throw new Error("Empty R2 object body");
    const bytes = await body.transformToByteArray();
    return Buffer.from(bytes);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    throw new Error(`Failed to download document (${fileKey}): ${msg}`);
  }
}

/**
 * document/ingest — full pipeline per TASKS.md §6.
 * Steps are granular for Inngest retries; Qdrant point IDs are deterministic.
 */
export const documentIngest = inngest.createFunction(
  {
    id: "document-ingest",
    concurrency: [{ limit: 2, key: "event.data.userId" }],
    retries: 3,
  },
  { event: "document/uploaded" },
  async ({ event, step }) => {
    const { documentId, userId } = event.data as {
      documentId: string;
      userId: string;
    };

    await step.run("ensure-qdrant", async () => {
      await ensureStudyChunksCollection();
    });

    const doc = await step.run("load-document", async () => {
      const d = await db.document.findFirst({
        where: { id: documentId, userId, deletedAt: null },
      });
      if (!d) throw new Error("Document not found");
      return d;
    });

    // Content-hash dedupe already handled at register; skip if READY
    if (doc.ingestStatus === "READY" && doc.pageCount && doc.pageCount > 0) {
      return { ok: true, skipped: true, reason: "already-ready" };
    }

    await step.run("mark-processing", async () => {
      await db.document.update({
        where: { id: documentId },
        data: {
          ingestStatus: "PROCESSING",
          ingestProgress: 5,
          failureReason: null,
        },
      });
    });

    const fileBytes = await step.run("fetch-bytes", async () => {
      try {
        if (doc.sourceType === "URL" && doc.sourceUrl) {
          const fetched = await fetchRemotePdf(doc.sourceUrl);
          // Persist for later viewer access (R2 or local) — best-effort
          if (!doc.fileKey) {
            const key = `users/${userId}/url/${documentId}.pdf`;
            try {
              if (storageBackend() === "local" || !env.R2_BUCKET) {
                await writeLocalObject(key, fetched.bytes);
              } else if (
                env.R2_ACCOUNT_ID &&
                env.R2_ACCESS_KEY_ID &&
                env.R2_SECRET_ACCESS_KEY &&
                env.R2_BUCKET
              ) {
                const { S3Client, PutObjectCommand } = await import(
                  "@aws-sdk/client-s3"
                );
                const client = new S3Client({
                  region: "auto",
                  endpoint: `https://${env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
                  credentials: {
                    accessKeyId: env.R2_ACCESS_KEY_ID,
                    secretAccessKey: env.R2_SECRET_ACCESS_KEY,
                  },
                });
                await client.send(
                  new PutObjectCommand({
                    Bucket: env.R2_BUCKET,
                    Key: key,
                    Body: fetched.bytes,
                    ContentType: "application/pdf",
                  }),
                );
              }
              // Always also keep a local copy in development for resilience
              if (env.NODE_ENV === "development") {
                await writeLocalObject(key, fetched.bytes).catch(() => undefined);
              }
              await db.document.update({
                where: { id: documentId },
                data: {
                  fileKey: key,
                  mimeType: "application/pdf",
                  sizeBytes: fetched.sizeBytes,
                },
              });
            } catch (persistErr) {
              logger.warn(
                { err: persistErr, documentId },
                "Failed to persist URL PDF to storage — continuing with in-memory bytes",
              );
              // Ensure local fallback so retries can re-read
              try {
                await writeLocalObject(key, fetched.bytes);
                await db.document.update({
                  where: { id: documentId },
                  data: {
                    fileKey: key,
                    mimeType: "application/pdf",
                    sizeBytes: fetched.sizeBytes,
                  },
                });
              } catch {
                /* OCR can still proceed from returned bytes */
              }
            }
          }
          // Touch storage so backend is resolved
          createStorage();
          return {
            bytesB64: fetched.bytes.toString("base64"),
            mimeType: "application/pdf" as const,
          };
        }
        if (!doc.fileKey) throw new Error("Document has no fileKey or sourceUrl");
        const buf = await downloadDocumentBytes(doc.fileKey);
        const mime = (doc.mimeType ?? "application/pdf") as
          | "application/pdf"
          | "image/png"
          | "image/jpeg"
          | "image/webp";
        return { bytesB64: buf.toString("base64"), mimeType: mime };
      } catch (err) {
        const msg = err instanceof Error ? err.message : "Failed to fetch file";
        await db.document.update({
          where: { id: documentId },
          data: { ingestStatus: "FAILED", failureReason: msg },
        });
        throw err;
      }
    });

    const pages = await step.run("split-pages", async () => {
      const bytes = Buffer.from(fileBytes.bytesB64, "base64");
      if (fileBytes.mimeType.startsWith("image/")) {
        return [{ pageNumber: 1, bytesB64: fileBytes.bytesB64, mediaType: fileBytes.mimeType }];
      }
      const split = await splitPdfPages(bytes);
      await db.document.update({
        where: { id: documentId },
        data: { pageCount: split.length, ingestProgress: 10 },
      });
      // Quota already enforced at presign; still record pagesUsed once at end
      return split.map((p) => ({
        pageNumber: p.pageNumber,
        bytesB64: Buffer.from(p.bytes).toString("base64"),
        mediaType: "application/pdf" as const,
      }));
    });

    // OCR each page (step per page for resume-friendly retries)
    const pageMarkdowns: PageInput[] = [];
    for (const page of pages) {
      const ocrResult = await step.run(`ocr-page-${page.pageNumber}`, async () => {
        const data = Buffer.from(page.bytesB64, "base64");
        const result = await ocrPage({
          data,
          mediaType: page.mediaType,
          pageNumber: page.pageNumber,
        });
        await db.documentPage.upsert({
          where: {
            documentId_pageNumber: {
              documentId,
              pageNumber: page.pageNumber,
            },
          },
          create: {
            documentId,
            pageNumber: page.pageNumber,
            ocrStatus: "READY",
            hasHandwriting: result.hasHandwriting,
            hasImages: result.hasImages,
            hasTables: result.hasTables,
            classification: result.classification,
            markdown: result.markdown,
          },
          update: {
            ocrStatus: "READY",
            hasHandwriting: result.hasHandwriting,
            hasImages: result.hasImages,
            hasTables: result.hasTables,
            classification: result.classification,
            markdown: result.markdown,
            failureReason: null,
          },
        });
        const done = page.pageNumber;
        const total = pages.length;
        const progress = 10 + Math.floor((done / total) * 60);
        await db.document.update({
          where: { id: documentId },
          data: { ingestProgress: progress },
        });
        return result;
      });
      pageMarkdowns.push({
        pageNumber: page.pageNumber,
        markdown: ocrResult.markdown,
      });
    }

    await step.run("chunk-embed-upsert", async () => {
      const chunks = chunkPages(pageMarkdowns);
      // Clear prior vectors for this doc (idempotent re-ingest)
      await deleteDocumentChunks(userId, documentId);

      const batchSize = 32;
      let upserted = 0;
      for (let i = 0; i < chunks.length; i += batchSize) {
        const batch = chunks.slice(i, i + batchSize);
        const vectors = await embedTexts(batch.map((c) => c.text));
        upserted += await upsertStudyChunks({
          userId,
          documentId,
          title: doc.title,
          chunks: batch,
          denseVectors: vectors,
        });
      }

      const pageCount = pages.length;
      const before = await db.document.findUnique({ where: { id: documentId } });
      const firstReady = before?.ingestStatus !== "READY";

      await db.document.update({
        where: { id: documentId },
        data: {
          ingestStatus: "READY",
          ingestProgress: 100,
          pageCount,
          failureReason: null,
        },
      });

      // Count pages toward user quota only the first time we become READY
      if (firstReady) {
        await db.user.update({
          where: { id: userId },
          data: { pagesUsed: { increment: pageCount } },
        });
      }

      logger.info(
        { documentId, userId, pages: pageCount, chunks: upserted },
        "document/ingest complete",
      );
      return { chunks: upserted, pages: pageCount };
    });

    return { ok: true, documentId };
  },
);

export function contentHashOf(bytes: Buffer): string {
  return createHash("sha256").update(bytes).digest("hex");
}
