import { describe, expect, it } from "vitest";
import {
  isValidNormalizedBBox,
  normalizedBBoxToPixels,
} from "./bbox";

describe("normalizedBBoxToPixels", () => {
  it("maps full image", () => {
    const r = normalizedBBoxToPixels(
      { ymin: 0, xmin: 0, ymax: 1000, xmax: 1000 },
      1000,
      2000,
      0,
    );
    expect(r).toEqual({ left: 0, top: 0, width: 1000, height: 2000 });
  });

  it("clamps out-of-range coords", () => {
    const r = normalizedBBoxToPixels(
      { ymin: -100, xmin: -50, ymax: 1200, xmax: 1500 },
      100,
      100,
      0,
    );
    expect(r).toEqual({ left: 0, top: 0, width: 100, height: 100 });
  });

  it("swaps inverted ymin/ymax", () => {
    const r = normalizedBBoxToPixels(
      { ymin: 800, xmin: 100, ymax: 200, xmax: 500 },
      1000,
      1000,
      0,
    );
    expect(r!.top).toBeLessThan(r!.top + r!.height);
    expect(r!.height).toBeGreaterThan(0);
  });

  it("returns null for empty region after clamp", () => {
    const r = normalizedBBoxToPixels(
      { ymin: 500, xmin: 500, ymax: 500, xmax: 500 },
      10,
      10,
      0,
    );
    expect(r).toBeNull();
  });

  it("applies padding without leaving image", () => {
    const r = normalizedBBoxToPixels(
      { ymin: 0, xmin: 0, ymax: 100, xmax: 100 },
      200,
      200,
      8,
    );
    expect(r!.left).toBe(0);
    expect(r!.top).toBe(0);
  });
});

describe("isValidNormalizedBBox", () => {
  it("accepts valid objects", () => {
    expect(
      isValidNormalizedBBox({ ymin: 0, xmin: 0, ymax: 1, xmax: 1 }),
    ).toBe(true);
  });
  it("rejects invalid", () => {
    expect(isValidNormalizedBBox(null)).toBe(false);
    expect(isValidNormalizedBBox({ ymin: 0 })).toBe(false);
  });
});
