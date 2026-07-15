/**
 * Phase 7 seed — demo user with sample notes + sample paper for local dev.
 *
 *   bun run packages/db/prisma/seed/demo.ts
 *   # or: bun run --filter @examgpt/db seed
 */
import { createHash, randomUUID } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import { PrismaClient } from "@prisma/client";

const db = new PrismaClient();
const DEMO_USER = "user_demo_examgpt";
const UPLOAD_ROOT =
  process.env.LOCAL_UPLOAD_DIR ??
  resolve(process.cwd(), "apps/server/.data/uploads");

async function buildNotesPdf(): Promise<Buffer> {
  const pdf = await PDFDocument.create();
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  for (let n = 1; n <= 3; n++) {
    const page = pdf.addPage([612, 792]);
    let y = 740;
    const draw = (t: string, size = 12, b = false) => {
      page.drawText(t, {
        x: 48,
        y,
        size,
        font: b ? bold : font,
        color: rgb(0.1, 0.1, 0.15),
        maxWidth: 500,
      });
      y -= size + 10;
    };
    draw(`Demo Notes — Page ${n}`, 16, true);
    draw("Topic: Thermodynamics (NEET seed content)");
    if (n === 1) {
      draw("First law: dU = Q - W (sign convention as in class notes).");
      draw("| Process | dU | Q |");
      draw("| Isochoric | nonzero | equal dU |");
    }
    if (n === 2) {
      draw("[FIGURE: PV diagram showing isothermal and adiabatic curves]");
      draw("Adiabatic: Q = 0 so dU = -W.");
    }
    if (n === 3) {
      draw("Entropy: dS = dQ_rev / T for reversible paths.");
    }
  }
  return Buffer.from(await pdf.save());
}

async function buildPaperPdf(): Promise<Buffer> {
  const pdf = await PDFDocument.create();
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const page = pdf.addPage([612, 792]);
  let y = 740;
  const lines = [
    "Demo Mini Paper — Physics",
    "Q1. First law of thermodynamics is:",
    "(A) dU = Q + W  (B) dU = Q - W  (C) dU = W - Q  (D) Q = W",
    "Q2. In an adiabatic process:",
    "(A) Q = 0  (B) W = 0  (C) dU = 0  (D) T is constant",
  ];
  for (const t of lines) {
    page.drawText(t, { x: 48, y, size: 12, font, maxWidth: 500 });
    y -= 22;
  }
  return Buffer.from(await pdf.save());
}

async function putLocal(key: string, body: Buffer) {
  const full = join(UPLOAD_ROOT, ...key.split("/"));
  await mkdir(dirname(full), { recursive: true });
  await writeFile(full, body);
}

async function main() {
  console.log("Seeding demo user", DEMO_USER);

  await db.user.upsert({
    where: { id: DEMO_USER },
    create: {
      id: DEMO_USER,
      email: "demo@examgpt.local",
      name: "Demo Student",
      age: 18,
      onboarded: true,
      pagesUsed: 0,
    },
    update: {
      email: "demo@examgpt.local",
      name: "Demo Student",
      onboarded: true,
    },
  });

  await db.examProfile.upsert({
    where: { userId: DEMO_USER },
    create: {
      userId: DEMO_USER,
      type: "NEET",
      syllabusStatus: "READY",
      syllabusTopics: {
        exam: "NEET",
        subjects: ["Physics", "Chemistry", "Biology"],
      },
    },
    update: { type: "NEET", syllabusStatus: "READY" },
  });

  const notesBytes = await buildNotesPdf();
  const notesHash = createHash("sha256").update(notesBytes).digest("hex");
  const notesKey = `users/${DEMO_USER}/notes/${randomUUID()}.pdf`;
  await putLocal(notesKey, notesBytes);

  // Soft-delete prior demo notes of same title to avoid clutter
  await db.document.updateMany({
    where: { userId: DEMO_USER, title: "Demo Thermodynamics Notes" },
    data: { deletedAt: new Date() },
  });

  const notesDoc = await db.document.create({
    data: {
      userId: DEMO_USER,
      kind: "NOTES",
      title: "Demo Thermodynamics Notes",
      sourceType: "UPLOAD_PDF",
      fileKey: notesKey,
      mimeType: "application/pdf",
      sizeBytes: notesBytes.length,
      pageCount: 3,
      ingestStatus: "READY",
      ingestProgress: 100,
      contentHash: notesHash,
    },
  });

  for (let p = 1; p <= 3; p++) {
    await db.documentPage.upsert({
      where: {
        documentId_pageNumber: {
          documentId: notesDoc.id,
          pageNumber: p,
        },
      },
      create: {
        documentId: notesDoc.id,
        pageNumber: p,
        ocrStatus: "READY",
        hasTables: p === 1,
        hasImages: p === 2,
        classification: "printed",
        markdown:
          p === 1
            ? "Thermodynamics notes.\n\n| Process | ΔU |\n|---|---|\n| Isochoric | nonzero |"
            : p === 2
              ? "[FIGURE: PV diagram isothermal vs adiabatic]\n\nAdiabatic: Q = 0."
              : "Entropy: dS = dQ_rev / T.",
      },
      update: { ocrStatus: "READY" },
    });
  }

  const paperBytes = await buildPaperPdf();
  const paperKey = `users/${DEMO_USER}/papers/${randomUUID()}.pdf`;
  await putLocal(paperKey, paperBytes);

  await db.document.updateMany({
    where: { userId: DEMO_USER, title: "Demo Mini Physics Paper" },
    data: { deletedAt: new Date() },
  });

  const paperDoc = await db.document.create({
    data: {
      userId: DEMO_USER,
      kind: "PAPER",
      title: "Demo Mini Physics Paper",
      sourceType: "UPLOAD_PDF",
      fileKey: paperKey,
      mimeType: "application/pdf",
      sizeBytes: paperBytes.length,
      pageCount: 1,
      ingestStatus: "READY",
      ingestProgress: 100,
      contentHash: createHash("sha256").update(paperBytes).digest("hex"),
    },
  });

  // Minimal READY test with 2 questions for instant CBT
  const existingTest = await db.test.findFirst({
    where: { userId: DEMO_USER, title: "Demo Mini CBT" },
  });
  if (!existingTest) {
    const test = await db.test.create({
      data: {
        userId: DEMO_USER,
        source: "PYQ_UPLOAD",
        status: "READY",
        title: "Demo Mini CBT",
        paperDocumentId: paperDoc.id,
        durationMin: 15,
        totalMarks: 8,
        markingScheme: { correct: 4, wrong: -1, unattempted: 0 },
        questions: {
          create: [
            {
              index: 1,
              section: "Physics",
              text: "First law of thermodynamics is:",
              options: [
                { key: "A", text: "dU = Q + W" },
                { key: "B", text: "dU = Q - W" },
                { key: "C", text: "dU = W - Q" },
                { key: "D", text: "Q = W" },
              ],
              correctKey: "B",
              topic: "Thermodynamics",
              answerConfidence: 1,
            },
            {
              index: 2,
              section: "Physics",
              text: "In an adiabatic process:",
              options: [
                { key: "A", text: "Q = 0" },
                { key: "B", text: "W = 0" },
                { key: "C", text: "dU = 0" },
                { key: "D", text: "T is constant" },
              ],
              correctKey: "A",
              topic: "Thermodynamics",
              answerConfidence: 1,
            },
          ],
        },
      },
    });
    console.log("Created demo test", test.id);
  }

  console.log(
    JSON.stringify(
      {
        userId: DEMO_USER,
        notesDocId: notesDoc.id,
        paperDocId: paperDoc.id,
        uploadRoot: UPLOAD_ROOT,
      },
      null,
      2,
    ),
  );
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await db.$disconnect();
  });
