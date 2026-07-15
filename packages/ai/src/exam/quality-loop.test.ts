import { describe, expect, it, vi } from "vitest";
import { runQualityRegenLoop } from "./quality-loop";

describe("runQualityRegenLoop", () => {
  it("accepts valid non-duplicate questions", async () => {
    const res = await runQualityRegenLoop(3, {
      maxRounds: 2,
      generate: async (n) =>
        Array.from({ length: n }, (_, i) => ({
          text: `Q valid ${i} stem long enough`,
          topic: "Thermo",
        })),
      isDuplicate: async () => false,
      validate: async () => ({ valid: true, reason: "ok" }),
    });
    expect(res.accepted).toHaveLength(3);
    expect(res.dropped).toHaveLength(0);
  });

  it("regenerates after gate failures up to max rounds", async () => {
    let round = 0;
    const res = await runQualityRegenLoop(2, {
      maxRounds: 2,
      generate: async (n) => {
        round += 1;
        return Array.from({ length: n }, (_, i) => ({
          text: `r${round}-q${i}`,
          topic: "T",
          round,
        }));
      },
      isDuplicate: async () => false,
      validate: async (q) => {
        // first round all fail, second pass
        if ((q as { round: number }).round === 1) {
          return { valid: false, reason: "bad distractors" };
        }
        return { valid: true, reason: "ok" };
      },
    });
    expect(res.accepted.length).toBe(2);
    expect(res.dropped.some((d) => d.startsWith("gate:"))).toBe(true);
    expect(res.roundsUsed).toBeGreaterThanOrEqual(2);
  });

  it("drops duplicates and does not pad", async () => {
    let calls = 0;
    const res = await runQualityRegenLoop(5, {
      maxRounds: 0, // single generate pass only
      generate: async () => {
        calls += 1;
        return [
          { text: "same", topic: "A" },
          { text: "same", topic: "A" },
          { text: "unique", topic: "A" },
        ];
      },
      isDuplicate: async (q) => q.text === "same",
      validate: async () => ({ valid: true, reason: "ok" }),
    });
    expect(calls).toBe(1);
    expect(res.accepted).toHaveLength(1);
    expect(res.accepted[0]?.text).toBe("unique");
    expect(res.dropped.filter((d) => d.startsWith("dup:")).length).toBe(2);
    // Never pads to requested=5
    expect(res.accepted.length).toBeLessThan(5);
  });
});
