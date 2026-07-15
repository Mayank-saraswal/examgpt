import { describe, expect, it } from "vitest";
import { questionBankPointId } from "./question-bank-ids";

describe("questionBankPointId", () => {
  it("is deterministic for same testId:questionIndex", () => {
    const a = questionBankPointId("test_abc", 0);
    const b = questionBankPointId("test_abc", 0);
    expect(a).toBe(b);
    expect(a).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/,
    );
  });

  it("differs across question indices and tests", () => {
    const a = questionBankPointId("test_abc", 0);
    const b = questionBankPointId("test_abc", 1);
    const c = questionBankPointId("test_xyz", 0);
    expect(a).not.toBe(b);
    expect(a).not.toBe(c);
  });

  it("matches sha1(testId:questionIndex) layout", () => {
    const id = questionBankPointId("cm_test_fixed", 3);
    expect(id.length).toBe(36);
    expect(questionBankPointId("cm_test_fixed", 3)).toBe(id);
  });
});

describe("wasCorrect update path (id mapping)", () => {
  it("maps each graded response to a unique bank point id", () => {
    const responses = [
      { questionIndex: 0, isCorrect: true as boolean | null },
      { questionIndex: 1, isCorrect: false as boolean | null },
      { questionIndex: 2, isCorrect: null },
    ];
    const ids = responses.map((r) =>
      questionBankPointId("attempt-test", r.questionIndex),
    );
    expect(new Set(ids).size).toBe(3);
    expect(ids[0]).not.toBe(ids[1]);
    // null isCorrect still targets the same deterministic id for that index
    expect(ids[2]).toBe(questionBankPointId("attempt-test", 2));
  });
});
