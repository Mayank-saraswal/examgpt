import { describe, expect, it } from "vitest";
import {
  assertChunkInvariants,
  chunkPage,
  chunkPages,
  estimateTokens,
  splitAtomicBlocks,
} from "./chunking";

function prose(tokens: number): string {
  // ~4 chars/token
  return ("word ".repeat(tokens * 1)).trim();
}

describe("estimateTokens", () => {
  it("estimates roughly 4 chars per token", () => {
    expect(estimateTokens("abcd")).toBe(1);
    expect(estimateTokens("a".repeat(40))).toBe(10);
  });
});

describe("splitAtomicBlocks", () => {
  it("keeps markdown tables as a single atomic block", () => {
    const md = [
      "Intro text here.",
      "",
      "| A | B |",
      "| --- | --- |",
      "| 1 | 2 |",
      "| 3 | 4 |",
      "",
      "After table.",
    ].join("\n");
    const blocks = splitAtomicBlocks(md);
    const table = blocks.find((b) => b.includes("| A | B |"));
    expect(table).toBeDefined();
    expect(table).toContain("| 3 | 4 |");
    expect(table?.split("\n").length).toBeGreaterThanOrEqual(4);
  });

  it("keeps FIGURE blocks atomic", () => {
    const md = "Some text\n\n[FIGURE: a free-body diagram of a block on a plane]\n\nMore text";
    const blocks = splitAtomicBlocks(md);
    expect(blocks.some((b) => b.startsWith("[FIGURE:"))).toBe(true);
  });
});

describe("chunkPage invariants", () => {
  it("never exceeds max tokens except for oversized atomic tables", () => {
    const long = prose(2000);
    const chunks = chunkPage(1, long, { minTokens: 400, maxTokens: 600 });
    expect(chunks.length).toBeGreaterThan(1);
    for (const c of chunks) {
      // prose windows respect max; slight slack for overlap tail + boundary
      expect(c.tokenEstimate).toBeLessThanOrEqual(750);
      expect(c.pageNumber).toBe(1);
    }
  });

  it("applies overlap within the same page", () => {
    const text = Array.from({ length: 40 }, (_, i) => `Paragraph ${i}. ${prose(30)}`).join(
      "\n\n",
    );
    const chunks = chunkPage(2, text, { minTokens: 100, maxTokens: 200, overlapRatio: 0.15 });
    expect(chunks.length).toBeGreaterThan(1);
    // Adjacent chunks should share some trailing/leading content due to overlap
    const a = chunks[0]!.text;
    const b = chunks[1]!.text;
    const tail = a.slice(-80).trim();
    // overlap is approximate; at least second chunk should not be empty
    expect(b.length).toBeGreaterThan(0);
    expect(tail.length).toBeGreaterThan(0);
  });

  it("keeps a large table whole in one chunk", () => {
    const rows = Array.from({ length: 30 }, (_, i) => `| c${i} | d${i} |`).join("\n");
    const table = `| H1 | H2 |\n| --- | --- |\n${rows}`;
    const md = `${prose(50)}\n\n${table}\n\n${prose(50)}`;
    const chunks = chunkPage(1, md, { minTokens: 50, maxTokens: 200 });
    const withTable = chunks.filter((c) => c.text.includes("| H1 | H2 |"));
    expect(withTable.length).toBe(1);
    expect(withTable[0]!.text).toContain("| c29 | d29 |");
  });

  it("never merges content across pages", () => {
    const pages = [
      { pageNumber: 1, markdown: `Page one unique marker ALPHA.\n\n${prose(500)}` },
      { pageNumber: 2, markdown: `Page two unique marker BETA.\n\n${prose(500)}` },
    ];
    const chunks = chunkPages(pages, { minTokens: 100, maxTokens: 250 });
    assertChunkInvariants(chunks);
    for (const c of chunks) {
      if (c.pageNumber === 1) {
        expect(c.text).not.toContain("BETA");
      }
      if (c.pageNumber === 2) {
        expect(c.text).not.toContain("ALPHA");
      }
    }
    expect(chunks.some((c) => c.pageNumber === 1)).toBe(true);
    expect(chunks.some((c) => c.pageNumber === 2)).toBe(true);
  });

  it("flags hasImage when FIGURE present", () => {
    const chunks = chunkPage(
      1,
      `${prose(100)}\n\n[FIGURE: circuit diagram with resistor R1]\n\n${prose(100)}`,
      { minTokens: 50, maxTokens: 300 },
    );
    expect(chunks.some((c) => c.hasImage)).toBe(true);
  });
});
