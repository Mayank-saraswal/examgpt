import { TRPCError } from "@trpc/server";
import { z } from "zod";
import {
  presignUploadInput,
  registerUploadInput,
  MAX_PDF_BYTES,
} from "@examgpt/validators";
import { createTRPCRouter, protectedProcedure } from "../trpc";
import { createHash, randomUUID } from "node:crypto";

/**
 * Storage adapter is injected via context so packages/api stays free of AWS SDK.
 */
export type StorageAdapter = {
  presignPut: (opts: {
    key: string;
    mimeType: string;
    sizeBytes: number;
  }) => Promise<{ uploadUrl: string; publicUrl: string | null }>;
  presignGet?: (key: string) => Promise<string>;
  headObject?: (
    key: string,
  ) => Promise<{ contentLength: number; contentType?: string } | null>;
};

const addByUrlInput = z.object({
  url: z.string().url().max(2000),
  title: z.string().min(1).max(200),
  kind: z.enum(["NOTES", "BOOK", "SYLLABUS", "PAPER"]).default("NOTES"),
});

export const documentsRouter = createTRPCRouter({
  presignUpload: protectedProcedure
    .input(presignUploadInput)
    .mutation(async ({ ctx, input }) => {
      if (!ctx.storage) {
        throw new TRPCError({
          code: "PRECONDITION_FAILED",
          message: "File storage is not configured (R2 env vars missing)",
        });
      }

      const user = await ctx.db.user.upsert({
        where: { id: ctx.userId },
        create: { id: ctx.userId },
        update: {},
      });

      const quota = ctx.pageQuota ?? 2000;
      if (user.pagesUsed >= quota) {
        throw new TRPCError({
          code: "TOO_MANY_REQUESTS",
          message: `Page quota reached (${user.pagesUsed}/${quota} pages). Delete documents or raise INGEST_PAGE_QUOTA.`,
        });
      }

      const ext =
        input.sourceType === "UPLOAD_PDF"
          ? "pdf"
          : (input.mimeType.split("/")[1] ?? "bin");
      const key = `users/${ctx.userId}/${input.kind.toLowerCase()}/${randomUUID()}.${ext}`;

      const doc = await ctx.db.document.create({
        data: {
          userId: ctx.userId,
          kind: input.kind,
          title: input.title,
          sourceType: input.sourceType,
          fileKey: key,
          mimeType: input.mimeType,
          sizeBytes: input.sizeBytes,
          ingestStatus: "PENDING",
        },
      });

      const { uploadUrl, publicUrl } = await ctx.storage.presignPut({
        key,
        mimeType: input.mimeType,
        sizeBytes: input.sizeBytes,
      });

      return {
        documentId: doc.id,
        uploadUrl,
        fileKey: key,
        publicUrl,
        maxBytes: input.sizeBytes,
        pagesUsed: user.pagesUsed,
        pageQuota: quota,
      };
    }),

  registerUpload: protectedProcedure
    .input(registerUploadInput)
    .mutation(async ({ ctx, input }) => {
      const doc = await ctx.db.document.findFirst({
        where: { id: input.documentId, userId: ctx.userId, deletedAt: null },
      });
      if (!doc) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Document not found" });
      }

      if (input.contentHash) {
        const existing = await ctx.db.document.findFirst({
          where: {
            userId: ctx.userId,
            contentHash: input.contentHash,
            ingestStatus: "READY",
            deletedAt: null,
            NOT: { id: doc.id },
          },
        });
        if (existing) {
          await ctx.db.document.update({
            where: { id: doc.id },
            data: {
              contentHash: input.contentHash,
              ingestStatus: "READY",
              ingestProgress: 100,
              pageCount: existing.pageCount,
            },
          });
          return {
            documentId: doc.id,
            status: "READY" as const,
            deduped: true,
          };
        }
      }

      const updated = await ctx.db.document.update({
        where: { id: doc.id },
        data: {
          contentHash: input.contentHash,
          ingestStatus: "PENDING",
        },
      });

      if (doc.kind === "SYLLABUS") {
        await ctx.db.examProfile.updateMany({
          where: { userId: ctx.userId },
          data: {
            syllabusDocumentId: doc.id,
            syllabusStatus: "PENDING",
          },
        });
      }

      if (ctx.emitEvent && updated.kind === "SYLLABUS") {
        await ctx.emitEvent("syllabus/uploaded", {
          documentId: updated.id,
          userId: ctx.userId,
        });
      } else if (ctx.emitEvent) {
        await ctx.emitEvent("document/uploaded", {
          documentId: updated.id,
          userId: ctx.userId,
        });
      }

      return {
        documentId: updated.id,
        status: "PENDING" as const,
        deduped: false,
      };
    }),

  addByUrl: protectedProcedure
    .input(addByUrlInput)
    .mutation(async ({ ctx, input }) => {
      const user = await ctx.db.user.upsert({
        where: { id: ctx.userId },
        create: { id: ctx.userId },
        update: {},
      });
      const quota = ctx.pageQuota ?? 2000;
      if (user.pagesUsed >= quota) {
        throw new TRPCError({
          code: "TOO_MANY_REQUESTS",
          message: `Page quota reached (${user.pagesUsed}/${quota} pages).`,
        });
      }

      const doc = await ctx.db.document.create({
        data: {
          userId: ctx.userId,
          kind: input.kind,
          title: input.title,
          sourceType: "URL",
          sourceUrl: input.url,
          mimeType: "application/pdf",
          sizeBytes: MAX_PDF_BYTES,
          ingestStatus: "PENDING",
        },
      });

      if (ctx.emitEvent) {
        await ctx.emitEvent("document/uploaded", {
          documentId: doc.id,
          userId: ctx.userId,
        });
      }

      return { documentId: doc.id, status: "PENDING" as const };
    }),

  list: protectedProcedure.query(async ({ ctx }) => {
    return ctx.db.document.findMany({
      where: { userId: ctx.userId, deletedAt: null },
      orderBy: { createdAt: "desc" },
      include: {
        pages: {
          select: { pageNumber: true, ocrStatus: true },
          orderBy: { pageNumber: "asc" },
        },
      },
    });
  }),

  get: protectedProcedure
    .input(z.object({ id: z.string().min(1) }))
    .query(async ({ ctx, input }) => {
      const doc = await ctx.db.document.findFirst({
        where: { id: input.id, userId: ctx.userId, deletedAt: null },
        include: {
          pages: { orderBy: { pageNumber: "asc" } },
        },
      });
      if (!doc) throw new TRPCError({ code: "NOT_FOUND" });
      return doc;
    }),

  /** Signed URL for PDF viewer (private R2). */
  getFileUrl: protectedProcedure
    .input(z.object({ id: z.string().min(1) }))
    .query(async ({ ctx, input }) => {
      const doc = await ctx.db.document.findFirst({
        where: { id: input.id, userId: ctx.userId, deletedAt: null },
      });
      if (!doc) throw new TRPCError({ code: "NOT_FOUND" });
      if (!doc.fileKey) {
        throw new TRPCError({
          code: "PRECONDITION_FAILED",
          message: "Document has no stored file yet",
        });
      }
      if (!ctx.storage?.presignGet) {
        // Fall back to public base URL if configured
        throw new TRPCError({
          code: "PRECONDITION_FAILED",
          message: "File download is not configured",
        });
      }
      const url = await ctx.storage.presignGet(doc.fileKey);
      return { url, pageCount: doc.pageCount, title: doc.title };
    }),

  ingestStatus: protectedProcedure
    .input(z.object({ id: z.string().min(1) }))
    .query(async ({ ctx, input }) => {
      const doc = await ctx.db.document.findFirst({
        where: { id: input.id, userId: ctx.userId, deletedAt: null },
        select: {
          id: true,
          title: true,
          pageCount: true,
          ingestStatus: true,
          ingestProgress: true,
          failureReason: true,
          pages: {
            select: { pageNumber: true, ocrStatus: true },
          },
        },
      });
      if (!doc) throw new TRPCError({ code: "NOT_FOUND" });
      const pagesDone = doc.pages.filter((p) => p.ocrStatus === "READY").length;
      return {
        ...doc,
        pagesDone,
        pagesTotal: doc.pageCount ?? doc.pages.length,
      };
    }),

  retryIngest: protectedProcedure
    .input(z.object({ id: z.string().min(1) }))
    .mutation(async ({ ctx, input }) => {
      const doc = await ctx.db.document.findFirst({
        where: { id: input.id, userId: ctx.userId, deletedAt: null },
      });
      if (!doc) throw new TRPCError({ code: "NOT_FOUND" });
      await ctx.db.document.update({
        where: { id: doc.id },
        data: {
          ingestStatus: "PENDING",
          ingestProgress: 0,
          failureReason: null,
        },
      });
      if (ctx.emitEvent) {
        await ctx.emitEvent("document/uploaded", {
          documentId: doc.id,
          userId: ctx.userId,
        });
      }
      return { ok: true as const };
    }),

  delete: protectedProcedure
    .input(z.object({ id: z.string().min(1) }))
    .mutation(async ({ ctx, input }) => {
      const doc = await ctx.db.document.findFirst({
        where: { id: input.id, userId: ctx.userId, deletedAt: null },
      });
      if (!doc) throw new TRPCError({ code: "NOT_FOUND" });
      await ctx.db.document.update({
        where: { id: doc.id },
        data: { deletedAt: new Date() },
      });
      return { ok: true as const };
    }),
});

export function sha256Hex(data: string | Buffer) {
  return createHash("sha256").update(data).digest("hex");
}
