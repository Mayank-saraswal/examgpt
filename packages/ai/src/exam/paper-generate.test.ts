import { describe, expect, it } from "vitest";
import { cosineSimilarity, isNearDuplicate } from "./paper-generate";

describe("cosineSimilarity / isNearDuplicate", () => {
  it("detects identical vectors as duplicates", () => {
    const v = [1, 0, 0, 0];
    expect(cosineSimilarity(v, v)).toBeCloseTo(1);
    expect(isNearDuplicate(v, [[1, 0, 0, 0]], 0.88)).toBe(true);
  });

  it("orthogonal vectors are not duplicates", () => {
    expect(isNearDuplicate([1, 0, 0], [[0, 1, 0]], 0.88)).toBe(false);
  });
});
