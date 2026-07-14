import { describe, expect, it } from "vitest";
import { reciprocalRankFusion } from "./rrf";

describe("reciprocalRankFusion", () => {
  it("merges dense and sparse rankings without duplicates", () => {
    const dense = [
      { id: "a", v: 1 },
      { id: "b", v: 2 },
      { id: "c", v: 3 },
    ];
    const sparse = [
      { id: "b", v: 2 },
      { id: "d", v: 4 },
      { id: "a", v: 1 },
    ];
    const fused = reciprocalRankFusion([dense, sparse]);
    const ids = fused.map((f) => f.id);
    expect(new Set(ids).size).toBe(ids.length);
    // b appears high in both lists → should rank well
    expect(ids[0] === "a" || ids[0] === "b").toBe(true);
  });
});
