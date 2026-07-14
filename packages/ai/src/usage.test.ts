import { describe, expect, it, vi, beforeEach } from "vitest";
import {
  DailyBudgetExceededError,
  assertUnderDailyBudget,
  estimateCostUsd,
  setUsageSink,
  withAiUsage,
} from "./usage";

describe("estimateCostUsd", () => {
  it("returns positive cost for tokens", () => {
    expect(estimateCostUsd("gpt-4.1", 1000, 500)).toBeGreaterThan(0);
  });
});

describe("assertUnderDailyBudget", () => {
  beforeEach(() => setUsageSink(null));

  it("no-ops without sink or user", async () => {
    await expect(assertUnderDailyBudget(null)).resolves.toBeUndefined();
    await expect(assertUnderDailyBudget("u1")).resolves.toBeUndefined();
  });

  it("throws TOO_MANY_REQUESTS when over cap", async () => {
    process.env.AI_DAILY_BUDGET_USD = "1";
    setUsageSink({
      write: async () => {},
      getUserDailySpendUsd: async () => 1.5,
    });
    await expect(assertUnderDailyBudget("user_x")).rejects.toBeInstanceOf(
      DailyBudgetExceededError,
    );
  });

  it("fails open when spend query errors", async () => {
    setUsageSink({
      write: async () => {},
      getUserDailySpendUsd: async () => {
        throw new Error("db down");
      },
    });
    await expect(assertUnderDailyBudget("user_x")).resolves.toBeUndefined();
  });
});

describe("withAiUsage", () => {
  beforeEach(() => {
    process.env.AI_DAILY_BUDGET_USD = "10";
    setUsageSink(null);
  });

  it("writes usage after success", async () => {
    const write = vi.fn(async () => {});
    setUsageSink({
      write,
      getUserDailySpendUsd: async () => 0,
    });
    const out = await withAiUsage({
      userId: "u1",
      task: "title-gen",
      model: "gpt-4.1-mini",
      run: async () => ({ text: "hi", usage: { inputTokens: 10, outputTokens: 5 } }),
    });
    expect(out.text).toBe("hi");
    expect(write).toHaveBeenCalledOnce();
    const calls = write.mock.calls as unknown as [
      { userId: string; task: string; tokensIn: number; tokensOut: number },
    ][];
    expect(calls[0]?.[0]).toMatchObject({
      userId: "u1",
      task: "title-gen",
      tokensIn: 10,
      tokensOut: 5,
    });
  });
});

