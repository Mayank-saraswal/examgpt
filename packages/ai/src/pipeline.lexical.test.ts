import { describe, expect, it } from "vitest";
import { chunksHaveLexicalSupport } from "./pipeline";
import type { RetrievedChunk } from "./citations";

const thermo: RetrievedChunk[] = [
  {
    documentId: "d1",
    title: "Thermo notes",
    pageNumber: 1,
    chunkId: "c1",
    score: 0.5,
    text: "first law thermodynamics ideal gas temperature carnot adiabatic delta U",
  },
];

describe("chunksHaveLexicalSupport", () => {
  it("accepts on-topic thermodynamics query", () => {
    expect(
      chunksHaveLexicalSupport(
        "What is the first law of thermodynamics?",
        "first law of thermodynamics",
        thermo,
      ),
    ).toBe(true);
  });

  it("rejects off-topic software / personal queries", () => {
    expect(
      chunksHaveLexicalSupport(
        "How do I install Kubernetes on my notes PDF?",
        "install kubernetes",
        thermo,
      ),
    ).toBe(false);
    expect(
      chunksHaveLexicalSupport(
        "What is my neighbor phone number according to my syllabus?",
        "neighbor phone number",
        thermo,
      ),
    ).toBe(false);
  });
});
