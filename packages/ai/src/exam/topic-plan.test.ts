import { describe, expect, it } from "vitest";
import {
  allocateCounts,
  flattenSyllabusTopics,
  planTopicQuotas,
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
