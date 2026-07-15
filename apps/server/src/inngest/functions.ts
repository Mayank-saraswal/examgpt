import { db } from "@examgpt/db";
import { inngest } from "./client";
import { documentIngest } from "./document-ingest";
import { chatMemorySync } from "./memory-sync";
import { paperExtract } from "./paper-extract";
import { attemptTimeoutSweep } from "./attempt-sweep";
import { attemptAnalyze } from "./attempt-analyze";
import { paperGenerate } from "./paper-generate";
import { userCleanup } from "./user-cleanup";
import { captureException, captureMessage } from "../observability/sentry";
import { logger } from "../logger";

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
 * Phase 7 — central Inngest failure alert (logs + optional Sentry).
 * Functions should also set onFailure where user-visible status is updated.
 */
export const inngestFailureAlert = inngest.createFunction(
  { id: "inngest-failure-alert" },
  { event: "inngest/function.failed" },
  async ({ event }) => {
    const data = event.data as {
      function_id?: string;
      run_id?: string;
      error?: { message?: string; name?: string };
    };
    const msg = `Inngest failure: ${data.function_id ?? "unknown"} — ${data.error?.message ?? "error"}`;
    logger.error({ data }, msg);
    captureMessage(msg, "error");
    if (data.error) {
      captureException(new Error(data.error.message ?? "inngest failed"), {
        function_id: data.function_id,
        run_id: data.run_id,
      });
    }
    return { ok: true, alerted: true };
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
  inngestFailureAlert,
  syllabusIngest,
  documentIngest,
  chatMemorySync,
  paperExtract,
  attemptTimeoutSweep,
  attemptAnalyze,
  paperGenerate,
  userCleanup,
];
