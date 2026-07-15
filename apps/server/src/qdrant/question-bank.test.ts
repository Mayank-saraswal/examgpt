import { describe, expect, it } from "vitest";
import { questionBankPointId } from "./question-bank-ids";

describe("questionBankPointId", () => {
  it("is deterministic for same userId:testId:questionIndex", () => {
    const a = questionBankPointId("test_abc", 0, "user_1");
    const b = questionBankPointId("test_abc", 0, "user_1");
    expect(a).toBe(b);
    expect(a).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/,
    );
  });

  it("differs across users for same platform test (no collision)", () => {
    const a = questionBankPointId("platform_test", 1, "user_a");
    const b = questionBankPointId("platform_test", 1, "user_b");
    expect(a).not.toBe(b);
  });

  it("differs across question indices and tests", () => {
    const a = questionBankPointId("test_abc", 0, "u");
    const b = questionBankPointId("test_abc", 1, "u");
    const c = questionBankPointId("test_xyz", 0, "u");
    expect(a).not.toBe(b);
    expect(a).not.toBe(c);
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
      questionBankPointId("attempt-test", r.questionIndex, "user_x"),
    );
    expect(new Set(ids).size).toBe(3);
    expect(ids[0]).not.toBe(ids[1]);
    expect(ids[2]).toBe(
      questionBankPointId("attempt-test", 2, "user_x"),
    );
  });
});
