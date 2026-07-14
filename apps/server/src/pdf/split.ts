import { PDFDocument } from "pdf-lib";

/**
 * Split a multi-page PDF into single-page PDF buffers (1-based page numbers).
 * Uses pdf-lib only (no native canvas deps) so Gemini can OCR each page as application/pdf.
 */
export async function splitPdfPages(
  pdfBytes: Uint8Array | Buffer,
): Promise<{ pageNumber: number; bytes: Uint8Array }[]> {
  const src = await PDFDocument.load(pdfBytes, { ignoreEncryption: true });
  const total = src.getPageCount();
  if (total === 0) {
    throw new Error("PDF has 0 pages");
  }

  const out: { pageNumber: number; bytes: Uint8Array }[] = [];
  for (let i = 0; i < total; i++) {
    const doc = await PDFDocument.create();
    const [copied] = await doc.copyPages(src, [i]);
    doc.addPage(copied);
    const bytes = await doc.save();
    out.push({ pageNumber: i + 1, bytes });
  }
  return out;
}

export async function countPdfPages(pdfBytes: Uint8Array | Buffer): Promise<number> {
  const src = await PDFDocument.load(pdfBytes, { ignoreEncryption: true });
  return src.getPageCount();
}
