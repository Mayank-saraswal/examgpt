import { describe, expect, it } from "vitest";
import { sumReportAnalyzeCostUsd, sumUsageCostUsd } from "./cost-rollup";

describe("sumUsageCostUsd", () => {
  it("sums finite non-negative costs", () => {
    expect(
      sumUsageCostUsd([
        { costUsd: 0.01 },
        { costUsd: 0.02 },
        { costUsd: null },
        { costUsd: undefined },
        { costUsd: NaN },
        { costUsd: -1 },
      ]),
    ).toBe(0.03);
  });

  it("rounds to 6 decimals", () => {
    expect(
      sumUsageCostUsd([{ costUsd: 0.1 }, { costUsd: 0.2 }, { costUsd: 0.3 }]),
    ).toBe(0.6);
  });
});

describe("sumReportAnalyzeCostUsd", () => {
  it("includes explain and report-analysis tasks", () => {
    expect(
      sumReportAnalyzeCostUsd([
        { task: "explain", costUsd: 0.05 },
        { task: "report-analysis", costUsd: 0.1 },
        { task: "ocr", costUsd: 9 }, // not part of analyze rollup filter when task set
        { task: "web-search", costUsd: 0.01 },
      ]),
    ).toBe(0.16);
  });

  it("includes rows without task (legacy)", () => {
    expect(sumReportAnalyzeCostUsd([{ costUsd: 0.04 }])).toBe(0.04);
  });
});
