/**
 * Live paper/extract on the real NEET PDF in repo root.
 * Credit-aware: uses PAPER_EXTRACT_MAX_PAGES (default 5).
 *
 *   PAPER_EXTRACT_MAX_PAGES=5 bun run scripts/live-neet-extract.ts
 */
import { createHash, randomUUID } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { mkdir, writeFile, copyFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { db } from "@examgpt/db";

function loadEnv() {
  const p = resolve(import.meta.dir, "../.env");
  if (!existsSync(p)) throw new Error("Missing .env");
  for (const line of readFileSync(p, "utf8").split(/\r?\n/)) {
    const t = line.trim();
    if (!t || t.startsWith("#")) continue;
    const i = t.indexOf("=");
    if (i < 0) continue;
    const k = t.slice(0, i).trim();
    let v = t.slice(i + 1).trim();
    if (
      (v.startsWith('"') && v.endsWith('"')) ||
      (v.startsWith("'") && v.endsWith("'"))
    ) {
      v = v.slice(1, -1);
    }
    if (!(k in process.env) || !process.env[k]) process.env[k] = v;
  }
}
loadEnv();

const USER_ID = "user_live_verify_phase2";
const PDF_NAME = "NEET_2026_Answer_Key_Solution_Code_11_Download.pdf.pdf";
const maxPages = Number(process.env.PAPER_EXTRACT_MAX_PAGES ?? 5) || 5;

async function main() {
  process.env.PAPER_EXTRACT_MAX_PAGES = String(maxPages);
  process.env.AI_MODEL_OCR ??= "gpt-4o-mini";
  process.env.AI_MODEL_VISION_EXTRACT ??= "gpt-4o-mini";
  process.env.STORAGE_BACKEND ??= "local";

  const pdfPath = resolve(import.meta.dir, "..", PDF_NAME);
  if (!existsSync(pdfPath)) {
    throw new Error(`Missing PDF at ${pdfPath}`);
  }
  const pdfBytes = readFileSync(pdfPath);
  const hash = createHash("sha256").update(pdfBytes).digest("hex");
  console.log(
    `PDF ${PDF_NAME} size=${pdfBytes.length} hash=${hash.slice(0, 12)}… maxPages=${maxPages}`,
  );

  await db.user.upsert({
    where: { id: USER_ID },
    create: {
      id: USER_ID,
      email: "phase2+live@examgpt.dev",
      name: "Phase2 Live",
      onboarded: true,
    },
    update: { onboarded: true },
  });

  const fileKey = `users/${USER_ID}/papers/${randomUUID()}.pdf`;
  const localRoot = resolve(
    process.env.LOCAL_UPLOAD_DIR ??
      join(import.meta.dir, "../apps/server/.data/uploads"),
  );
  const localPath = join(localRoot, fileKey);
  await mkdir(dirname(localPath), { recursive: true });
  await writeFile(localPath, pdfBytes);
  console.log(`Wrote ${localPath}`);

  const doc = await db.document.create({
    data: {
      userId: USER_ID,
      kind: "PAPER",
      title: `NEET 2026 live extract (${maxPages}p cap)`,
      sourceType: "UPLOAD_PDF",
      fileKey,
      mimeType: "application/pdf",
      sizeBytes: pdfBytes.length,
      contentHash: hash,
      ingestStatus: "PENDING",
      ingestProgress: 0,
    },
  });

  const test = await db.test.create({
    data: {
      userId: USER_ID,
      source: "PYQ_UPLOAD",
      title: doc.title,
      paperDocumentId: doc.id,
      paperYear: 2026,
      durationMin: 180,
      totalMarks: 0,
      markingScheme: { correct: 4, wrong: -1, unattempted: 0 },
      status: "EXTRACTING",
    },
  });
  console.log(`testId=${test.id} documentId=${doc.id}`);

  const ev = await fetch("http://127.0.0.1:8288/e/test", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      name: "test.paper_uploaded",
      data: {
        testId: test.id,
        documentId: doc.id,
        userId: USER_ID,
        forceContinue: true,
      },
    }),
  });
  if (!ev.ok) throw new Error(`Inngest failed: ${await ev.text()}`);
  console.log("Emitted test.paper_uploaded — polling…");

  const deadline = Date.now() + maxPages * 90_000 + 180_000;
  let last = "";
  while (Date.now() < deadline) {
    const t = await db.test.findUnique({
      where: { id: test.id },
      include: { questions: { orderBy: { index: "asc" }, take: 5 } },
    });
    if (!t) throw new Error("test gone");
    const line = `${t.status} q=${await db.question.count({ where: { testId: test.id } })} fail=${t.failureReason ?? ""}`;
    if (line !== last) {
      console.log(`  [${new Date().toISOString()}] ${line}`);
      last = line;
    }
    if (t.status === "READY" || t.status === "FAILED" || t.status === "NEEDS_REVIEW") {
      const count = await db.question.count({ where: { testId: test.id } });
      console.log("\n--- Result ---");
      console.log({
        status: t.status,
        questionCount: count,
        failureReason: t.failureReason,
        sample: t.questions.map((q) => ({
          index: q.index,
          section: q.section,
          correctKey: q.correctKey,
          text: q.text.slice(0, 80),
        })),
        testUrl: `http://localhost:3000/tests/${t.id}`,
      });
      if (t.status === "FAILED" && count === 0) process.exit(2);
      process.exit(0);
    }
    await Bun.sleep(5000);
  }
  console.error("Timed out");
  process.exit(3);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
