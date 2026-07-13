import { TRPCError } from "@trpc/server";
import {
  presignUploadInput,
  registerUploadInput,
} from "@examgpt/validators";
import { createTRPCRouter, protectedProcedure } from "../trpc";
import { createHash, randomUUID } from "node:crypto";

/**
 * Storage adapter is injected via context so packages/api stays free of AWS SDK.
 * Server fills ctx.storage when creating context.
 */
export type StorageAdapter = {
  presignPut: (opts: {
    key: string;
    mimeType: string;
    sizeBytes: number;
  }) => Promise<{ uploadUrl: string; publicUrl: string | null }>;
  headObject?: (key: string) => Promise<{ contentLength: number; contentType?: string } | null>;
};

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

      await ctx.db.user.upsert({
        where: { id: ctx.userId },
        create: { id: ctx.userId },
        update: {},
      });

      const ext =
        input.sourceType === "UPLOAD_PDF"
          ? "pdf"
          : input.mimeType.split("/")[1] ?? "bin";
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

      // Optional content-hash dedupe
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

      // Kick off syllabus/document ingest in background when storage registration completes
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

  list: protectedProcedure.query(async ({ ctx }) => {
    return ctx.db.document.findMany({
      where: { userId: ctx.userId, deletedAt: null },
      orderBy: { createdAt: "desc" },
    });
  }),

  get: protectedProcedure
    .input((val: unknown) => {
      if (typeof val === "string" && val.length > 0) return val;
      throw new TRPCError({ code: "BAD_REQUEST", message: "documentId required" });
    })
    .query(async ({ ctx, input }) => {
      const doc = await ctx.db.document.findFirst({
        where: { id: input, userId: ctx.userId, deletedAt: null },
      });
      if (!doc) throw new TRPCError({ code: "NOT_FOUND" });
      return doc;
    }),

  ingestStatus: protectedProcedure
    .input((val: unknown) => {
      if (typeof val === "string" && val.length > 0) return val;
      throw new TRPCError({ code: "BAD_REQUEST", message: "documentId required" });
    })
    .query(async ({ ctx, input }) => {
      const doc = await ctx.db.document.findFirst({
        where: { id: input, userId: ctx.userId, deletedAt: null },
        select: {
          id: true,
          ingestStatus: true,
          ingestProgress: true,
          failureReason: true,
        },
      });
      if (!doc) throw new TRPCError({ code: "NOT_FOUND" });
      return doc;
    }),
});

/** Utility for tests / hashing client-side mirrors */
export function sha256Hex(data: string | Buffer) {
  return createHash("sha256").update(data).digest("hex");
}
