import { describe, expect, it } from "vitest";
import { scoreAttempt, NEET_MARKING } from "./scoring";
import type { AttemptEventLike } from "./palette";

const baseQ = [
  { index: 1, correctKey: "A" },
  { index: 2, correctKey: "B" },
  { index: 3, correctKey: "C", flagged: true },
];

function e(
  questionIndex: number,
  type: AttemptEventLike["type"],
  ms: number,
  optionKey?: string,
): AttemptEventLike {
  return { questionIndex, type, clientTs: new Date(ms), optionKey };
}

describe("scoreAttempt", () => {
  it("awards +4 correct, -1 wrong, 0 unattempted; skips flagged", () => {
    const events = [
      e(1, "VISIT", 1),
      e(1, "SELECT", 2, "A"),
      e(2, "VISIT", 3),
      e(2, "SELECT", 4, "D"),
      // 3 flagged with answer — ignored
      e(3, "VISIT", 5),
      e(3, "SELECT", 6, "C"),
    ];
    const { score, maxScore, responses } = scoreAttempt({
      questions: baseQ,
      events,
      scheme: NEET_MARKING,
    });
    expect(maxScore).toBe(8); // only 2 scoreable
    expect(score).toBe(4 - 1);
    expect(responses.find((r) => r.questionIndex === 1)?.isCorrect).toBe(true);
    expect(responses.find((r) => r.questionIndex === 2)?.isCorrect).toBe(false);
    expect(responses.find((r) => r.questionIndex === 3)?.marksAwarded).toBe(0);
  });

  it("ANSWERED_MARKED counts as answered", () => {
    const events = [
      e(1, "VISIT", 1),
      e(1, "SELECT", 2, "A"),
      e(1, "MARK_REVIEW", 3),
    ];
    const { score } = scoreAttempt({
      questions: [{ index: 1, correctKey: "A" }],
      events,
      scheme: NEET_MARKING,
    });
    expect(score).toBe(4);
  });
});
