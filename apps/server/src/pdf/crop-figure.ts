import sharp from "sharp";
import {
  isValidNormalizedBBox,
  normalizedBBoxToPixels,
  type NormalizedBBox,
} from "@examgpt/ai";

export type CropResult =
  | { ok: true; png: Buffer; uncertain: boolean }
  | { ok: false; reason: string };

/**
 * Crop a page PNG using a normalized 0–1000 bbox.
 */
export async function cropFigureFromPagePng(
  pagePng: Buffer,
  bbox: unknown,
  opts?: { uncertain?: boolean },
): Promise<CropResult> {
  if (!isValidNormalizedBBox(bbox)) {
    return { ok: false, reason: "invalid_bbox" };
  }
  const meta = await sharp(pagePng).metadata();
  const w = meta.width ?? 0;
  const h = meta.height ?? 0;
  const rect = normalizedBBoxToPixels(bbox as NormalizedBBox, w, h, 6);
  if (!rect) return { ok: false, reason: "empty_crop" };

  try {
    const png = await sharp(pagePng)
      .extract({
        left: rect.left,
        top: rect.top,
        width: rect.width,
        height: rect.height,
      })
      .png()
      .toBuffer();
    return {
      ok: true,
      png,
      uncertain: Boolean(opts?.uncertain),
    };
  } catch (err) {
    return {
      ok: false,
      reason: err instanceof Error ? err.message : "sharp_extract_failed",
    };
  }
}
