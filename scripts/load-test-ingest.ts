/**
 * Phase 7 — load-test helper: build an N-page PDF (default 300) and measure
 * page-split + optional OCR sample rate without running full OCR on all pages.
 *
 * Full 300-page OCR is expensive; this script:
 *  1) Builds a 300-page PDF
 *  2) Times pdf-lib split cost
 *  3) Optionally OCRs --sample=N pages (default 3) with current AI_MODEL_OCR
 *  4) Prints recommended Inngest concurrency / embedding batch knobs
 *
 *   bun run scripts/load-test-ingest.ts --pages=300 --sample=3
 */
import { readFileSync, existsSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";

function loadEnv() {
  const p = resolve(import.meta.dir, "../.env");
  if (!existsSync(p)) return;
  for (const line of readFileSync(p, "utf8").split(/\r?\n/)) {
    const t = line.trim();
    if (!t || t.startsWith("#")) continue;
    const i = t.indexOf("=");
    if (i < 0) continue;
    const k = t.slice(0, i).trim();
    let v = t.slice(i + 1).trim();
    if (
      (v.startsWith('"') && v.EndsWith('"')) ||
      (v.startsWith("'") && v.endsWith("'"))
    ) {
      v = v.slice(1, -1);
    }
    if (!process.env[k]) process.env[k] = v;
  }
}
loadEnv();

const pagesArg = process.argv.find((a) => a.startsWith("--pages="));
const sampleArg = process.argv.find((a) => a.startsWith("--sample="));
const PAGES = pagesArg ? Number(pagesArg.split("=")[1]) : 300;
const SAMPLE = sampleArg ? Number(sampleArg.split("=")[1]) : 3;

async function buildPdf(n: number): Promise<Buffer> {
  const pdf = await PDFDocument.create();
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  for (let i = 1; i <= n; i++) {
    const page = pdf.addPage([612, 792]);
    page.drawText(`Load test page ${i}/${n}`, {
      x: 48,
      y: 740,
      size: 14,
      font,
      color: rgb(0, 0, 0),
    });
    page.drawText(
      "Lorem exam notes. Table row | ColA | ColB | for density.",
      { x: 48, y: 700, size: 11, font, maxWidth: 500 },
    );
  }
  return Buffer.from(await pdf.save());
}

async function splitPages(bytes: Buffer) {
  // Inline minimal split using pdf-lib (same idea as server splitPdfPages)
  const { PDFDocument: PD } = await import("pdf-lib");
  const src = await PD.load(bytes, { ignoreEncryption: true });
  const out: { pageNumber: number; bytes: Buffer }[] = [];
  for (let i = 0; i < src.getPageCount(); i++) {
    const one = await PD.create();
    const [copied] = await one.copyPages(src, [i]);
    one.addPage(copied);
    out.push({ pageNumber: i + 1, bytes: Buffer.from(await one.save()) });
  }
  return out;
}

async function main() {
  console.log(`Building ${PAGES}-page PDF…`);
  const t0 = Date.now();
  const bytes = await buildPdf(PAGES);
  console.log(`PDF built in ${Date.now() - t0}ms size=${bytes.length}`);

  const out = resolve(
    import.meta.dir,
    `../.tmp-loadtest-${PAGES}p.pdf`,
  );
  writeFileSync(out, bytes);
  console.log(`Wrote ${out}`);

  console.log("Splitting pages…");
  const t1 = Date.now();
  const pages = await splitPages(bytes);
  console.log(
    `Split ${pages.length} pages in ${Date.now() - t1}ms (~${Math.round((Date.now() - t1) / pages.length)}ms/page)`,
  );

  if (SAMPLE > 0) {
    process.env.AI_MODEL_OCR = process.env.AI_MODEL_OCR ?? "gpt-4o-mini";
    const { ocrPage, getModelConfig } = await import("@examgpt/ai");
    console.log("OCR config", getModelConfig("ocr"));
    const latencies: number[] = [];
    for (let i = 0; i < Math.min(SAMPLE, pages.length); i++) {
      const p = pages[i]!;
      const s = Date.now();
      try {
        const r = await ocrPage({
          data: p.bytes,
          mediaType: "application/pdf",
          pageNumber: p.pageNumber,
        });
        latencies.push(Date.now() - s);
        console.log(
          `  page ${p.pageNumber}: ${Date.now() - s}ms md=${r.markdown.slice(0, 60).replace(/\n/g, " ")}…`,
        );
      } catch (e) {
        console.error(`  page ${p.pageNumber} FAIL`, e);
      }
    }
    if (latencies.length) {
      const avg = latencies.reduce((a, b) => a + b, 0) / latencies.length;
      const estFullMin = (avg * PAGES) / 60_000;
      console.log("\n=== recommendations ===");
      console.log(`avg OCR latency: ${Math.round(avg)}ms`);
      console.log(`est full ${PAGES}p serial: ~${estFullMin.toFixed(1)} min`);
      console.log(
        `suggested INNGEST concurrency (per user): ${Math.min(4, Math.max(1, Math.floor(60_000 / avg)))}`,
      );
      console.log(
        `suggested embedding batch size: 16–32 (text-embedding-3-large ~8191 tokens/input)`,
      );
      console.log(
        `env: INGEST_OCR_CONCURRENCY=2 EMBED_BATCH_SIZE=24 (wire in document-ingest when tuning)`,
      );
    }
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
