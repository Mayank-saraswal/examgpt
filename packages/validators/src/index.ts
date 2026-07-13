import { z } from "zod";

/** Health check has no input; kept as a schema for symmetry with other procedures. */
export const healthPingInput = z.void().optional();

export const healthPingOutput = z.object({
  ok: z.literal(true),
  service: z.string(),
  timestamp: z.string(),
});

export type HealthPingOutput = z.infer<typeof healthPingOutput>;

export const examTypeSchema = z.enum(["NEET", "JEE", "OTHER"]);
export type ExamTypeInput = z.infer<typeof examTypeSchema>;

export const updateProfileInput = z.object({
  name: z.string().min(1).max(120).optional(),
  age: z.number().int().min(10).max(100).optional(),
});

export const setExamInput = z
  .object({
    type: examTypeSchema,
    customName: z.string().min(1).max(120).optional(),
    targetYear: z.number().int().min(2020).max(2040).optional(),
  })
  .superRefine((val, ctx) => {
    if (val.type === "OTHER" && !val.customName?.trim()) {
      ctx.addIssue({
        code: "custom",
        message: "customName is required when exam type is OTHER",
        path: ["customName"],
      });
    }
  });

export const MAX_PDF_BYTES = 100 * 1024 * 1024; // 100MB
export const MAX_IMAGE_BYTES = 20 * 1024 * 1024; // 20MB

export const allowedPdfMime = z.literal("application/pdf");
export const allowedImageMime = z.enum([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/heic",
  "image/heif",
]);

export const presignUploadInput = z
  .object({
    kind: z.enum(["SYLLABUS", "NOTES", "BOOK", "PAPER"]),
    title: z.string().min(1).max(200),
    mimeType: z.string().min(1),
    sizeBytes: z.number().int().positive(),
    sourceType: z.enum(["UPLOAD_PDF", "UPLOAD_IMAGE"]),
  })
  .superRefine((val, ctx) => {
    if (val.sourceType === "UPLOAD_PDF") {
      if (val.mimeType !== "application/pdf") {
        ctx.addIssue({
          code: "custom",
          message: "PDF uploads must use application/pdf",
          path: ["mimeType"],
        });
      }
      if (val.sizeBytes > MAX_PDF_BYTES) {
        ctx.addIssue({
          code: "custom",
          message: `PDF must be ≤ ${MAX_PDF_BYTES} bytes`,
          path: ["sizeBytes"],
        });
      }
    }
    if (val.sourceType === "UPLOAD_IMAGE") {
      const ok = allowedImageMime.safeParse(val.mimeType).success;
      if (!ok) {
        ctx.addIssue({
          code: "custom",
          message: "Unsupported image MIME type",
          path: ["mimeType"],
        });
      }
      if (val.sizeBytes > MAX_IMAGE_BYTES) {
        ctx.addIssue({
          code: "custom",
          message: `Image must be ≤ ${MAX_IMAGE_BYTES} bytes`,
          path: ["sizeBytes"],
        });
      }
    }
  });

export const registerUploadInput = z.object({
  documentId: z.string().min(1),
  contentHash: z.string().min(8).max(128).optional(),
});

export const fetchSyllabusUrlInput = z.object({
  url: z.string().url().max(2000),
  title: z.string().min(1).max(200).default("Syllabus"),
});

export const registerPushTokenInput = z.object({
  token: z.string().min(10).max(512),
  platform: z.enum(["ios", "android", "web"]),
});
