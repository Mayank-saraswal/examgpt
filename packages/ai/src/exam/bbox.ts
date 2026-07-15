/**
 * Normalized bounding boxes (Gemini-style 0–1000) → pixel crop rectangles.
 */

export type NormalizedBBox = {
  /** ymin, xmin, ymax, xmax in 0..1000 relative to image height/width */
  ymin: number;
  xmin: number;
  ymax: number;
  xmax: number;
};

export type PixelRect = {
  left: number;
  top: number;
  width: number;
  height: number;
};

function clamp(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n));
}

/**
 * Convert normalized 0–1000 bbox to integer pixel crop rect, clamped to image.
 * Returns null if the rect would be empty or degenerate after clamping.
 */
export function normalizedBBoxToPixels(
  bbox: NormalizedBBox,
  imageWidth: number,
  imageHeight: number,
  padPx = 4,
): PixelRect | null {
  if (imageWidth <= 0 || imageHeight <= 0) return null;

  let ymin = clamp(bbox.ymin, 0, 1000);
  let xmin = clamp(bbox.xmin, 0, 1000);
  let ymax = clamp(bbox.ymax, 0, 1000);
  let xmax = clamp(bbox.xmax, 0, 1000);

  if (ymax < ymin) [ymin, ymax] = [ymax, ymin];
  if (xmax < xmin) [xmin, xmax] = [xmax, xmin];

  let top = Math.floor((ymin / 1000) * imageHeight) - padPx;
  let left = Math.floor((xmin / 1000) * imageWidth) - padPx;
  let bottom = Math.ceil((ymax / 1000) * imageHeight) + padPx;
  let right = Math.ceil((xmax / 1000) * imageWidth) + padPx;

  top = clamp(top, 0, imageHeight - 1);
  left = clamp(left, 0, imageWidth - 1);
  bottom = clamp(bottom, top + 1, imageHeight);
  right = clamp(right, left + 1, imageWidth);

  const width = right - left;
  const height = bottom - top;
  if (width < 2 || height < 2) return null;

  return { left, top, width, height };
}

export function isValidNormalizedBBox(b: unknown): b is NormalizedBBox {
  if (!b || typeof b !== "object") return false;
  const o = b as Record<string, unknown>;
  return (
    typeof o.ymin === "number" &&
    typeof o.xmin === "number" &&
    typeof o.ymax === "number" &&
    typeof o.xmax === "number" &&
    Number.isFinite(o.ymin) &&
    Number.isFinite(o.xmin) &&
    Number.isFinite(o.ymax) &&
    Number.isFinite(o.xmax)
  );
}
