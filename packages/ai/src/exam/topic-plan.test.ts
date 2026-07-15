import { describe, expect, it } from "vitest";
import {
  allocateCounts,
  flattenSyllabusTopics,
  mergeVerdictsWithBankAccuracy,
  planTopicQuotas,
  renormalizeAutoWeights,
  weakTopicShare,
} from "./topic-plan";

describe("allocateCounts", () => {
  it("sums to total", () => {
    const m = allocateCounts(
      [
        { key: "a", weight: 0.5 },
        { key: "b", weight: 0.3 },
        { key: "c", weight: 0.2 },
      ],
      10,
    );
    const sum = [...m.values()].reduce((s, n) => s + n, 0);
    expect(sum).toBe(10);
    expect(m.get("a")).toBeGreaterThanOrEqual(m.get("b")!);
  });
});

describe("planTopicQuotas", () => {
  it("auto mode over-represents weak topics (~50%)", () => {
    const plan = planTopicQuotas({
      questionCount: 20,
      mode: "auto",
      topicVerdicts: [
        { topic: "Thermodynamics", verdict: "WEAK" },
        { topic: "Optics", verdict: "WEAK" },
        { topic: "Equilibrium", verdict: "MODERATE" },
        { topic: "Genetics", verdict: "STRONG" },
      ],
    });
    const total = plan.reduce((s, p) => s + p.count, 0);
    expect(total).toBe(20);
    expect(weakTopicShare(plan)).toBeGreaterThanOrEqual(0.4);
    expect(weakTopicShare(plan)).toBeLessThanOrEqual(0.6);
  });

  it("manual mode splits selected topics", () => {
    const plan = planTopicQuotas({
      questionCount: 9,
      mode: "manual",
      selectedTopics: ["A", "B", "C"],
    });
    expect(plan).toHaveLength(3);
    expect(plan.every((p) => p.count === 3)).toBe(true);
  });
});

describe("flattenSyllabusTopics", () => {
  it("reads nested subjects", () => {
    const topics = flattenSyllabusTopics({
      subjects: [
        {
          name: "Physics",
          units: [{ name: "M", topics: ["Laws of Motion", "Gravitation"] }],
        },
      ],
    });
    expect(topics).toEqual(["Laws of Motion", "Gravitation"]);
  });
});

describe("renormalizeAutoWeights missing categories", () => {
  it("puts 100% on sole present bucket", () => {
    const w = renormalizeAutoWeights(["WEAK"]);
    expect(w.WEAK).toBeCloseTo(1);
    expect(w.MODERATE).toBe(0);
    expect(w.STRONG).toBe(0);
  });

  it("renormalizes WEAK+STRONG without MODERATE", () => {
    const w = renormalizeAutoWeights(["WEAK", "STRONG"]);
    expect(w.WEAK + w.STRONG).toBeCloseTo(1);
    expect(w.WEAK).toBeGreaterThan(w.STRONG);
    expect(w.MODERATE).toBe(0);
  });
});

describe("mergeVerdictsWithBankAccuracy", () => {
  it("marks low bank accuracy as WEAK; report WEAK wins", () => {
    const bank = new Map([
      ["Thermo", { accuracy: 0.2, total: 5 }],
      ["Optics", { accuracy: 0.9, total: 4 }],
    ]);
    const merged = mergeVerdictsWithBankAccuracy(
      [{ topic: "Optics", verdict: "WEAK" }],
      bank,
    );
    const byTopic = Object.fromEntries(merged.map((m) => [m.topic, m.verdict]));
    expect(byTopic.Thermo).toBe("WEAK");
    expect(byTopic.Optics).toBe("WEAK");
  });
});

describe("planTopicQuotas with only weak present", () => {
  it("still fills all seats", () => {
    const plan = planTopicQuotas({
      questionCount: 10,
      mode: "auto",
      topicVerdicts: [
        { topic: "A", verdict: "WEAK" },
        { topic: "B", verdict: "WEAK" },
      ],
    });
    expect(plan.reduce((s, p) => s + p.count, 0)).toBe(10);
    expect(weakTopicShare(plan)).toBe(1);
  });
});
