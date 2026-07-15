import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";

function loadEnv() {
  const p = resolve(import.meta.dir, "../.env");
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
    process.env[k] = v;
  }
}
loadEnv();

const { ocrPage, getModelConfig } = await import("@examgpt/ai");
const ocrCfg = getModelConfig("ocr");
console.log("OCR config", ocrCfg);
console.log(
  "OPENAI key set?",
  Boolean(process.env.OPENAI_API_KEY),
  "GOOGLE key set?",
  Boolean(process.env.GOOGLE_GENERATIVE_AI_API_KEY),
);
const { PDFDocument, StandardFonts } = await import("pdf-lib");

const pdf = await PDFDocument.create();
const page = pdf.addPage([400, 200]);
const font = await pdf.embedFont(StandardFonts.Helvetica);
page.drawText("Hello ExamGPT OCR smoke test. Table: A | B", {
  x: 20,
  y: 150,
  size: 14,
  font,
});
const bytes = Buffer.from(await pdf.save());
console.log("pdf bytes", bytes.length);

const t0 = Date.now();
try {
  const result = await ocrPage({
    data: bytes,
    mediaType: "application/pdf",
    pageNumber: 1,
  });
  console.log("OCR ok in", Date.now() - t0, "ms");
  console.log(JSON.stringify(result, null, 2));
} catch (err) {
  console.error("OCR failed in", Date.now() - t0, "ms");
  console.error(err);
  process.exit(1);
}
