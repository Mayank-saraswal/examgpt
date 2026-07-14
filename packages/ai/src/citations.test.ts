import { describe, expect, it } from "vitest";
import {
  NOT_IN_NOTES_MESSAGE,
  validateAndSanitizeCitations,
  type RetrievedChunk,
} from "./citations";
import { notInNotesResult } from "./answer";

const retrieved: RetrievedChunk[] = [
  {
    documentId: "doc_abc",
    title: "Thermodynamics notes",
    pageNumber: 3,
    text: "Carnot cycle efficiency eta = 1 - Tc/Th",
    score: 0.9,
    chunkId: "c1",
  },
  {
    documentId: "doc_abc",
    title: "Thermodynamics notes",
    pageNumber: 2,
    text: "Table of specific heats",
    score: 0.8,
    chunkId: "c2",
  },
];

describe("validateAndSanitizeCitations", () => {
  it("keeps citations present in the retrieved set", () => {
    const content =
      "Efficiency is 1 - Tc/Th [Thermodynamics notes, p. 3] [citation:doc_abc:3]";
    const res = validateAndSanitizeCitations(content, retrieved);
    expect(res.valid).toHaveLength(1);
    expect(res.valid[0]).toMatchObject({
      documentId: "doc_abc",
      pageNumber: 3,
      title: "Thermodynamics notes",
    });
    expect(res.stripped).toHaveLength(0);
    expect(res.sanitizedContent).toContain("Thermodynamics notes");
  });

  it("strips invented citations not in retrieved set", () => {
    const content =
      "Force is F=ma [Random Book, p. 99] [citation:fake_doc:12] and also [Thermodynamics notes, p. 2]";
    const res = validateAndSanitizeCitations(content, retrieved);
    expect(res.valid).toHaveLength(1);
    expect(res.valid[0]?.pageNumber).toBe(2);
    expect(res.stripped.length).toBeGreaterThanOrEqual(2);
    expect(res.sanitizedContent).not.toMatch(/Random Book/i);
    expect(res.sanitizedContent).not.toMatch(/fake_doc/);
    expect(res.sanitizedContent).toContain("Thermodynamics notes");
  });

  it("returns empty valid list when nothing retrieved", () => {
    const content = "Something [Book, p. 1]";
    const res = validateAndSanitizeCitations(content, []);
    expect(res.valid).toHaveLength(0);
    expect(res.stripped.length).toBeGreaterThan(0);
  });
});

describe("threshold path (not in notes)", () => {
  it("returns fixed not-in-notes message with zero citations", () => {
    const res = notInNotesResult();
    expect(res.kind).toBe("not_in_notes");
    expect(res.content).toBe(NOT_IN_NOTES_MESSAGE);
    expect(res.citations).toEqual([]);
    expect(res.webSources).toEqual([]);
  });
});
