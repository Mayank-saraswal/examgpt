import { db } from "@examgpt/db";
import { inngest } from "./client";
import { documentIngest } from "./document-ingest";
import { chatMemorySync } from "./memory-sync";

/**
 * Phase 0 placeholder.
 */
export const helloWorld = inngest.createFunction(
  { id: "hello-world" },
  { event: "examgpt/hello" },
  async ({ event, step }) => {
    await step.run("log", async () => ({ received: event.name }));
    return { ok: true };
  },
);

/**
 * syllabus/ingest — OTHER exam custom syllabus (OCR path can reuse document/ingest later).
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

    // Fan-out to full document ingest for OCR + pages, then mark exam READY
    await step.sendEvent("fan-out-document-ingest", {
      name: "document/uploaded",
      data: { documentId, userId },
    });

    await step.run("mark-exam-pending-ocr", async () => {
      await db.examProfile.updateMany({
        where: { userId },
        data: {
          syllabusDocumentId: documentId,
          syllabusStatus: "PROCESSING",
        },
      });
    });

    return { ok: true, documentId, fannedOut: true };
  },
);

export const functions = [
  helloWorld,
  syllabusIngest,
  documentIngest,
  chatMemorySync,
];
