import { db } from "@examgpt/db";
import { inngest } from "./client";

/**
 * Phase 0 placeholder function so the serve endpoint has something registered.
 */
export const helloWorld = inngest.createFunction(
  { id: "hello-world" },
  { event: "examgpt/hello" },
  async ({ event, step }) => {
    await step.run("log", async () => {
      return { received: event.name };
    });
    return { ok: true };
  },
);

/**
 * syllabus/ingest — for OTHER exam custom syllabus.
 * Phase 1: stores a browsable topic tree (stub extract). Full OCR/vision in Phase 2.
 */
export const syllabusIngest = inngest.createFunction(
  { id: "syllabus-ingest" },
  { event: "syllabus/uploaded" },
  async ({ event, step }) => {
    const { documentId, userId } = event.data as {
      documentId: string;
      userId: string;
    };

    await step.run("mark-processing", async () => {
      await db.document.updateMany({
        where: { id: documentId, userId },
        data: { ingestStatus: "PROCESSING", ingestProgress: 10 },
      });
      await db.examProfile.updateMany({
        where: { userId },
        data: { syllabusStatus: "PROCESSING" },
      });
    });

    const topics = await step.run("extract-topics", async () => {
      const doc = await db.document.findFirst({
        where: { id: documentId, userId },
      });
      return {
        exam: "OTHER",
        version: "phase1-stub",
        sourceDocumentId: documentId,
        title: doc?.title ?? "Custom syllabus",
        subjects: [
          {
            name: "General",
            units: [
              {
                name: "Uploaded syllabus",
                topics: [
                  "Topics will be extracted by OCR in Phase 2",
                  doc?.sourceUrl
                    ? `Source: ${doc.sourceUrl}`
                    : "Uploaded file",
                ],
              },
            ],
          },
        ],
      };
    });

    await step.run("save-ready", async () => {
      await db.document.updateMany({
        where: { id: documentId, userId },
        data: {
          ingestStatus: "READY",
          ingestProgress: 100,
          pageCount: 1,
        },
      });
      await db.examProfile.updateMany({
        where: { userId },
        data: {
          syllabusStatus: "READY",
          syllabusTopics: topics,
          syllabusDocumentId: documentId,
        },
      });
      await db.user.updateMany({
        where: { id: userId },
        data: { onboarded: true },
      });
    });

    return { ok: true, documentId };
  },
);

export const functions = [helloWorld, syllabusIngest];
