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
import {
  ensureQuestionBankCollection,
  upsertQuestionBankItems,
} from "../qdrant/question-bank";

const threshold = () => env.PAPER_SYLLABUS_MATCH_THRESHOLD;

/**
 * paper/extract — OCR paper → syllabus match → extract MCQs → validate → READY
 */
export const paperExtract = inngest.createFunction(
  {
    id: "paper-extract",
    concurrency: [{ limit: 1, key: "event.data.userId" }],
    retries: 2,
    onFailure: async ({ event, error }) => {
      const data = event.data.event.data as {
        testId?: string;
        userId?: string;
        platform?: boolean;
      };
      if (!data?.testId) return;
      const msg =
        error instanceof Error
          ? error.message.slice(0, 500)
          : "paper/extract failed";
      await db.test.updateMany({
        where: {
          id: data.testId,
          status: { in: ["EXTRACTING", "NEEDS_REVIEW"] },
          ...(data.platform
            ? { visibility: "PLATFORM" as const }
            : { userId: data.userId }),
        },
        data: { status: "FAILED", failureReason: msg },
      });
      logger.error(
        { testId: data.testId, err: msg },
        "paper/extract onFailure → FAILED",
      );
    },
  },
  { event: "test.paper_uploaded" },
  async ({ event, step }) => {
    const { testId, documentId, userId, forceContinue, platform } =
      event.data as {
        testId: string;
        documentId: string;
        userId: string;
        forceContinue?: boolean;
        platform?: boolean;
      };

    const test = await step.run("load-test", async () => {
      const t = await db.test.findFirst({
        where: platform
          ? { id: testId, visibility: "PLATFORM", deletedAt: null }
          : { id: testId, userId, deletedAt: null },
      });
      if (!t) throw new Error("Test not found");
      return t;
    });
    const isPlatform = test.visibility === "PLATFORM" || Boolean(platform);

    await step.run("mark-extracting", async () => {
      await db.test.update({
        where: { id: testId },
        data: { status: "EXTRACTING", failureReason: null },
      });
    });

    const pageMarkdowns = await step.run("ocr-paper", async () => {
      // Platform papers: document is owned by the admin who uploaded (event userId).
      const doc = await db.document.findFirst({
        where: isPlatform
          ? { id: documentId, deletedAt: null }
          : { id: documentId, userId },
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
      // Credit guard: PAPER_EXTRACT_MAX_PAGES (default 8, hard max 100).
      // Set high (e.g. 80) for full-paper live verify; omit to stay cheap.
      const requested = Number(process.env.PAPER_EXTRACT_MAX_PAGES ?? 8);
      const maxPages = Math.max(
        1,
        Math.min(100, Number.isFinite(requested) && requested > 0 ? requested : 8),
      );
      const mds: string[] = [];
      logger.info(
        { documentId, totalPages: pages.length, maxPages },
        "paper OCR page budget",
      );
      for (const p of pages.slice(0, maxPages)) {
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

    /** Crop figures per question → imageKeys; failed crops flag question. */
    const figureMeta = await step.run("crop-figures", async () => {
      const meta: Record<
        number,
        { imageKeys: string[]; options: unknown; flaggedExtra: boolean }
      > = {};
      if (!test.paperDocumentId) return meta;

      const doc = await db.document.findFirst({
        where: isPlatform
          ? { id: test.paperDocumentId, deletedAt: null }
          : { id: test.paperDocumentId, userId },
      });
      if (!doc?.fileKey) return meta;

      let pageBytes: Awaited<ReturnType<typeof splitPdfPages>> = [];
      try {
        const bytes = await downloadDocumentBytes(doc.fileKey);
        pageBytes = await splitPdfPages(bytes);
      } catch (err) {
        logger.warn({ err }, "crop-figures: split failed");
        return meta;
      }

      const { renderPdfPageToPng } = await import("../pdf/render-page");
      const { cropFigureFromPagePng } = await import("../pdf/crop-figure");
      const { writeLocalObject } = await import("../storage/local");

      for (const q of extracted.questions) {
        const pageNum = q.pageNumber ?? 1;
        const page = pageBytes.find((p) => p.pageNumber === pageNum) ?? pageBytes[0];
        if (!page) continue;

        let imageKeys: string[] = [];
        let flaggedExtra = false;
        const options = q.options.map((o) => ({ ...o }));

        if (q.hasFigure) {
          if (!q.figureBbox) {
            flaggedExtra = true;
            logger.warn(
              { index: q.index },
              "hasFigure without figureBbox — flagging for review",
            );
          } else {
            try {
              const rendered = await renderPdfPageToPng(page.bytes, 2);
              const crop = await cropFigureFromPagePng(
                rendered.png,
                q.figureBbox,
                { uncertain: q.figureUncertain },
              );
              if (crop.ok) {
                const key = `users/${userId}/papers/${testId}/q${q.index}-fig.png`;
                await writeLocalObject(key, crop.png);
                imageKeys = [key];
                if (crop.uncertain) flaggedExtra = true;
              } else {
                flaggedExtra = true;
                logger.warn(
                  { index: q.index, reason: crop.reason },
                  "figure crop failed — flagging question",
                );
              }
            } catch (err) {
              flaggedExtra = true;
              logger.warn({ err, index: q.index }, "figure crop error");
            }
          }
        }

        // Option-level crops
        for (let i = 0; i < options.length; i++) {
          const o = options[i]!;
          if (!o.hasImage || !o.imageBbox) continue;
          try {
            const rendered = await renderPdfPageToPng(page.bytes, 2);
            const crop = await cropFigureFromPagePng(rendered.png, o.imageBbox);
            if (crop.ok) {
              const key = `users/${userId}/papers/${testId}/q${q.index}-opt-${o.key}.png`;
              await writeLocalObject(key, crop.png);
              (options[i] as { imageKey?: string }).imageKey = key;
            } else {
              flaggedExtra = true;
            }
          } catch {
            flaggedExtra = true;
          }
        }

        meta[q.index] = {
          imageKeys,
          options: options.map((o) => ({
            key: o.key,
            text: o.text,
            imageKey: (o as { imageKey?: string }).imageKey,
          })),
          flaggedExtra,
        };
      }
      return meta;
    });

    await step.run("persist-questions", async () => {
      await db.question.deleteMany({ where: { testId } });
      const scheme =
        (test.markingScheme as { correct?: number }) ?? NEET_MARKING;
      const correctMarks = typeof scheme.correct === "number" ? scheme.correct : 4;

      for (const q of validated) {
        const fig = figureMeta[q.index];
        await db.question.create({
          data: {
            testId,
            index: q.index,
            section: q.section,
            text: q.text,
            imageKeys: fig?.imageKeys ?? [],
            options: (fig?.options ?? q.options) as object,
            correctKey: q.correctKey,
            answerConfidence: q.answerConfidence,
            topic: q.topic,
            subtopic: q.subtopic,
            flagged: q.needsReview || Boolean(fig?.flaggedExtra),
          },
        });
      }

      const totalMarks = validated.filter((q) => !q.needsReview || q.correctKey)
        .length * correctMarks;

      const anyLowConf = validated.some(
        (q) =>
          q.needsReview ||
          (q.answerConfidence ?? 1) < 0.8 ||
          Boolean(figureMeta[q.index]?.flaggedExtra),
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
            ? "Some questions need review (low-confidence extraction/answers/figures). Flag bad ones, then finish review."
            : null,
        },
      });
    });

    await step.run("question-bank-upsert", async () => {
      // Platform papers: do NOT write per-user question_bank at extract time.
      // attempt/analyze upserts for the attempting user after grading.
      if (isPlatform) {
        return { n: 0, skipped: true as const };
      }
      try {
        await ensureQuestionBankCollection();
        const qs = await db.question.findMany({
          where: { testId },
          orderBy: { index: "asc" },
        });
        if (qs.length === 0) return { n: 0 };
        const n = await upsertQuestionBankItems(
          qs.map((q) => ({
            userId,
            testId,
            questionIndex: q.index,
            topic: q.topic ?? q.section ?? "Untagged",
            text: q.text,
            wasCorrect: null,
          })),
        );
        return { n };
      } catch (err) {
        logger.warn({ err, testId }, "question_bank upsert after extract failed");
        return { n: 0 };
      }
    });

    await step.run("notify-ready", async () => {
      const t = await db.test.findUnique({ where: { id: testId } });
      if (t?.status === "READY") {
        await sendPushToUser(
          userId,
          isPlatform ? "Platform paper extracted" : "Paper ready",
          isPlatform
            ? `"${t.title}" is READY — publish from admin when verified.`
            : `"${t.title}" is ready — start your test.`,
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
