import { describe, expect, it } from "vitest";
import {
  buildQuestionAnalysisRows,
  buildTimeAnalysis,
  buildTopicAnalysis,
  formatOptionChangeTrail,
  optionTrailFromEvents,
  rankWeakTopicsForGap,
  verdictForTopic,
} from "./analysis";

describe("formatOptionChangeTrail", () => {
  it("describes multi-option confusion", () => {
    expect(formatOptionChangeTrail(["B", "C", "B"])).toContain("B→C→B");
    expect(formatOptionChangeTrail(["B", "C", "B"])).toContain("confusion");
  });

  it("returns null for single select", () => {
    expect(formatOptionChangeTrail(["A"])).toBeNull();
  });
});

describe("verdictForTopic", () => {
  it("marks strong / weak / moderate", () => {
    expect(verdictForTopic(4, 4)).toBe("STRONG");
    expect(verdictForTopic(0, 3)).toBe("WEAK");
    expect(verdictForTopic(1, 2)).toBe("MODERATE");
  });
});

describe("buildTopicAnalysis", () => {
  it("aggregates by topic", () => {
    const topics = buildTopicAnalysis([
      {
        questionIndex: 0,
        topic: "Thermodynamics",
        subtopic: null,
        section: "Physics",
        correctKey: "A",
        selectedKey: "A",
        isCorrect: true,
        timeSpentSec: 40,
        visitCount: 1,
        optionChanges: 0,
        paletteState: "ANSWERED",
      },
      {
        questionIndex: 1,
        topic: "Thermodynamics",
        subtopic: null,
        section: "Physics",
        correctKey: "C",
        selectedKey: "B",
        isCorrect: false,
        timeSpentSec: 20,
        visitCount: 2,
        optionChanges: 2,
        paletteState: "ANSWERED",
      },
      {
        questionIndex: 2,
        topic: "Optics",
        subtopic: null,
        section: "Physics",
        correctKey: "A",
        selectedKey: null,
        isCorrect: null,
        timeSpentSec: 5,
        visitCount: 1,
        optionChanges: 0,
        paletteState: "NOT_ANSWERED",
      },
    ]);
    const thermo = topics.find((t) => t.topic === "Thermodynamics");
    expect(thermo?.attempted).toBe(2);
    expect(thermo?.correct).toBe(1);
    expect(thermo?.verdict).toBe("MODERATE");
  });
});

describe("buildTimeAnalysis + question rows", () => {
  it("flags slow-but-correct and confusion", () => {
    const inputs = [
      {
        questionIndex: 0,
        topic: "T",
        subtopic: null,
        section: null,
        correctKey: "A",
        selectedKey: "A",
        isCorrect: true as boolean | null,
        timeSpentSec: 200,
        visitCount: 1,
        optionChanges: 0,
        paletteState: "ANSWERED",
        optionTrail: ["A"],
      },
      {
        questionIndex: 1,
        topic: "T",
        subtopic: null,
        section: null,
        correctKey: "B",
        selectedKey: "C",
        isCorrect: false as boolean | null,
        timeSpentSec: 10,
        visitCount: 3,
        optionChanges: 3,
        paletteState: "ANSWERED",
        optionTrail: ["B", "C", "B"],
      },
    ];
    const time = buildTimeAnalysis(inputs);
    expect(time.slowButCorrect).toContain(0);
    const rows = buildQuestionAnalysisRows(inputs, time);
    expect(rows[0]?.isSlow).toBe(true);
    expect(rows[1]?.isConfused).toBe(true);
    expect(rows[1]?.confusionNote).toContain("B→C→B");
  });
});

describe("optionTrailFromEvents", () => {
  it("orders SELECT/CHANGE keys", () => {
    const trail = optionTrailFromEvents(
      [
        { questionIndex: 0, type: "SELECT", optionKey: "B", clientTs: 1 },
        { questionIndex: 0, type: "CHANGE", optionKey: "C", clientTs: 2 },
        { questionIndex: 0, type: "CHANGE", optionKey: "A", clientTs: 3 },
        { questionIndex: 1, type: "SELECT", optionKey: "D", clientTs: 4 },
      ],
      0,
    );
    expect(trail).toEqual(["B", "C", "A"]);
  });
});

describe("rankWeakTopicsForGap", () => {
  it("orders by missed marks", () => {
    const ranked = rankWeakTopicsForGap([
      {
        topic: "A",
        attempted: 2,
        correct: 0,
        wrong: 2,
        skipped: 0,
        avgTimeSec: 10,
        accuracy: 0,
        verdict: "WEAK",
      },
      {
        topic: "B",
        attempted: 1,
        correct: 0,
        wrong: 1,
        skipped: 0,
        avgTimeSec: 10,
        accuracy: 0,
        verdict: "WEAK",
      },
    ]);
    expect(ranked[0]?.topic).toBe("A");
    expect(ranked[0]?.missedMarks).toBe(8);
  });
});
