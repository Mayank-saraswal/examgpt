import {
  extractPaperQuestions,
  validateExtractedQuestions,
  solveMissingAnswers,
  NEET_MARKING,
} from "@examgpt/ai";
import { db } from "@examgpt/db";
import { inngest } from "./client";
import { logger } from "../logger";
import { env } from "../env";
import { sendPushToUser } from "../push";
import { downloadDocumentBytes } from "../storage/download";
import { ocrPage } from "@examgpt/ai";
import { splitPdfPages } from "../pdf/split";

const threshold = () => env.PAPER_SYLLABUS_MATCH_THRESHOLD;

/**
 * paper/extract — OCR paper → syllabus match → extract MCQs → validate → READY
 */
export const paperExtract = inngest.createFunction(
  {
    id: "paper-extract",
    concurrency: [{ limit: 1, key: "event.data.userId" }],
    retries: 2,
  },
  { event: "test.paper_uploaded" },
  async ({ event, step }) => {
    const { testId, documentId, userId, forceContinue } = event.data as {
      testId: string;
      documentId: string;
      userId: string;
      forceContinue?: boolean;
    };

    const test = await step.run("load-test", async () => {
      const t = await db.test.findFirst({
        where: { id: testId, userId, deletedAt: null },
      });
      if (!t) throw new Error("Test not found");
      return t;
    });

    await step.run("mark-extracting", async () => {
      await db.test.update({
        where: { id: testId },
        data: { status: "EXTRACTING", failureReason: null },
      });
    });

    const pageMarkdowns = await step.run("ocr-paper", async () => {
      const doc = await db.document.findFirst({
        where: { id: documentId, userId },
      });
      if (!doc) throw new Error("Document not found");

      // Prefer existing OCR pages
      const existing = await db.documentPage.findMany({
        where: { documentId, ocrStatus: "READY" },
        orderBy: { pageNumber: "asc" },
      });
      if (existing.length > 0) {
        return existing.map((p) => p.markdown ?? "");
      }

      if (!doc.fileKey) throw new Error("Document has no file");
      const bytes = await downloadDocumentBytes(doc.fileKey);
      const pages = await splitPdfPages(bytes);
      const mds: string[] = [];
      for (const p of pages.slice(0, 40)) {
        // cap pages for cost
        try {
          const r = await ocrPage({
            data: p.bytes,
            mediaType: "application/pdf",
            pageNumber: p.pageNumber,
            userId,
          });
          mds.push(r.markdown);
          await db.documentPage.upsert({
            where: {
              documentId_pageNumber: {
                documentId,
                pageNumber: p.pageNumber,
              },
            },
            create: {
              documentId,
              pageNumber: p.pageNumber,
              ocrStatus: "READY",
              markdown: r.markdown,
              classification: r.classification,
              hasHandwriting: r.hasHandwriting,
              hasImages: r.hasImages,
              hasTables: r.hasTables,
            },
            update: {
              ocrStatus: "READY",
              markdown: r.markdown,
            },
          });
        } catch (err) {
          logger.warn({ err, page: p.pageNumber }, "paper OCR page failed");
          mds.push("");
        }
      }
      return mds;
    });

    const combined = pageMarkdowns.filter(Boolean).join("\n\n---\n\n");
    if (!combined.trim()) {
      await step.run("fail-empty", async () => {
        await db.test.update({
          where: { id: testId },
          data: {
            status: "FAILED",
            failureReason: "Could not OCR any pages from paper",
          },
        });
      });
      return { ok: false, reason: "empty-ocr" };
    }

    // Syllabus match: keyword overlap vs exam profile topics (lightweight)
    const matchScore = await step.run("syllabus-match", async () => {
      const exam = await db.examProfile.findUnique({ where: { userId } });
      const topics = (exam?.syllabusTopics as { name?: string }[] | null) ?? [];
      const topicNames = topics
        .map((t) => (typeof t === "string" ? t : t?.name))
        .filter(Boolean)
        .map((s) => String(s).toLowerCase());
      if (topicNames.length === 0) return 1; // no syllabus → pass

      const text = combined.toLowerCase();
      let hits = 0;
      for (const name of topicNames.slice(0, 80)) {
        if (name && text.includes(name.slice(0, 24))) hits += 1;
      }
      const score = hits / Math.min(topicNames.length, 40);
      await db.test.update({
        where: { id: testId },
        data: { syllabusMatchScore: score },
      });
      return score;
    });

    if (!forceContinue && matchScore < threshold()) {
      await step.run("needs-review-mismatch", async () => {
        await db.test.update({
          where: { id: testId },
          data: {
            status: "NEEDS_REVIEW",
            failureReason: `This paper doesn't look like your syllabus (matched ${Math.round(matchScore * 100)}%). Upload another, or continue anyway?`,
          },
        });
        await sendPushToUser(
          userId,
          "Paper needs review",
          `Syllabus match ${Math.round(matchScore * 100)}% — confirm or upload another.`,
          { testId, kind: "NEEDS_REVIEW" },
        );
      });
      return { ok: true, status: "NEEDS_REVIEW", matchScore };
    }

    const extracted = await step.run("extract-questions", async () => {
      return extractPaperQuestions({ markdown: combined, userId });
    });

    const validated = await step.run("validate-solve", async () => {
      const v = validateExtractedQuestions(extracted.questions);
      return solveMissingAnswers({ questions: v, userId });
    });

    await step.run("persist-questions", async () => {
      await db.question.deleteMany({ where: { testId } });
      const scheme =
        (test.markingScheme as { correct?: number }) ?? NEET_MARKING;
      const correctMarks = typeof scheme.correct === "number" ? scheme.correct : 4;

      for (const q of validated) {
        await db.question.create({
          data: {
            testId,
            index: q.index,
            section: q.section,
            text: q.text,
            options: q.options,
            correctKey: q.correctKey,
            answerConfidence: q.answerConfidence,
            topic: q.topic,
            subtopic: q.subtopic,
            flagged: q.needsReview,
          },
        });
      }

      const totalMarks = validated.filter((q) => !q.needsReview || q.correctKey)
        .length * correctMarks;

      const anyLowConf = validated.some(
        (q) => q.needsReview || (q.answerConfidence ?? 1) < 0.8,
      );

      await db.test.update({
        where: { id: testId },
        data: {
          status: anyLowConf ? "NEEDS_REVIEW" : "READY",
          totalMarks,
          title: extracted.title ?? test.title,
          paperYear: extracted.paperYear ?? test.paperYear,
          durationMin: extracted.durationMin ?? test.durationMin,
          failureReason: anyLowConf
            ? "Some questions need review (low-confidence extraction/answers). Flag bad ones, then finish review."
            : null,
        },
      });
    });

    await step.run("notify-ready", async () => {
      const t = await db.test.findUnique({ where: { id: testId } });
      if (t?.status === "READY") {
        await sendPushToUser(
          userId,
          "Paper ready",
          `"${t.title}" is ready — start your test.`,
          { testId, kind: "READY" },
        );
      } else if (t?.status === "NEEDS_REVIEW") {
        await sendPushToUser(
          userId,
          "Review questions",
          "Spot-check flagged questions before starting.",
          { testId, kind: "NEEDS_REVIEW" },
        );
      }
    });

    return { ok: true, questions: validated.length };
  },
);
