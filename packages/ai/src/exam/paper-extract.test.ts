import { describe, expect, it } from "vitest";
import {
  extractedQuestionSchema,
  paperExtractSchema,
  validateExtractedQuestions,
} from "./paper-extract";
import { selectExplainTask } from "../registry";

describe("paperExtractSchema figure fields", () => {
  it("accepts hasFigure + figureBbox + pageNumber", () => {
    const parsed = paperExtractSchema.parse({
      title: "NEET 2024",
      paperYear: 2024,
      durationMin: 200,
      questions: [
        {
          index: 1,
          section: "Physics",
          text: "Refer to the figure for the circuit.",
          options: [
            { key: "A", text: "1 A", hasImage: null, imageBbox: null },
            { key: "B", text: "2 A", hasImage: null, imageBbox: null },
            { key: "C", text: "3 A", hasImage: null, imageBbox: null },
            { key: "D", text: "4 A", hasImage: null, imageBbox: null },
          ],
          correctKey: "B",
          topic: "Current Electricity",
          subtopic: null,
          hasFigure: true,
          figureBbox: { ymin: 100, xmin: 50, ymax: 400, xmax: 900 },
          figureUncertain: false,
          pageNumber: 2,
        },
      ],
    });
    expect(parsed.questions[0]!.hasFigure).toBe(true);
    expect(parsed.questions[0]!.figureBbox?.ymin).toBe(100);
    expect(parsed.questions[0]!.pageNumber).toBe(2);
  });

  it("accepts option-level imageBbox", () => {
    const q = extractedQuestionSchema.parse({
      index: 3,
      section: null,
      text: "Which graph is correct?",
      options: [
        {
          key: "A",
          text: "Option A",
          hasImage: true,
          imageBbox: { ymin: 10, xmin: 10, ymax: 200, xmax: 400 },
        },
        {
          key: "B",
          text: "Option B",
          hasImage: true,
          imageBbox: { ymin: 10, xmin: 410, ymax: 200, xmax: 800 },
        },
      ],
      correctKey: null,
      topic: null,
      subtopic: null,
      hasFigure: false,
      figureBbox: null,
      figureUncertain: null,
      pageNumber: null,
    });
    expect(q.options[0]!.hasImage).toBe(true);
    expect(q.options[0]!.imageBbox?.xmax).toBe(400);
  });

  it("validateExtractedQuestions does not drop figure metadata", () => {
    const validated = validateExtractedQuestions([
      {
        index: 1,
        text: "See figure",
        options: [
          { key: "A", text: "x" },
          { key: "B", text: "y" },
        ],
        correctKey: "A",
        hasFigure: true,
        figureBbox: { ymin: 0, xmin: 0, ymax: 500, xmax: 500 },
        figureUncertain: true,
        pageNumber: 1,
      },
    ]);
    expect(validated[0]!.hasFigure).toBe(true);
    expect(validated[0]!.figureBbox).toEqual({
      ymin: 0,
      xmin: 0,
      ymax: 500,
      xmax: 500,
    });
    expect(validated[0]!.figureUncertain).toBe(true);
  });
});

describe("imageKeys explain routing (extract wiring contract)", () => {
  it("imageKeys from crop step route explain-vision", () => {
    // After crop-figures, persisted Question.imageKeys drive routing
    const imageKeys = ["users/u1/papers/t1/q1-fig.png"];
    expect(selectExplainTask(imageKeys)).toBe("explain-vision");
    expect(selectExplainTask([])).toBe("explain");
  });
});
