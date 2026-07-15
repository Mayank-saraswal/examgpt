/**
 * Sum AiUsageLog-like rows for an attempt analyze pipeline.
 * Pure helper — unit-tested; server supplies filtered log rows.
 */

export type UsageCostRow = {
  costUsd: number | null | undefined;
  task?: string | null;
};

/**
 * Sum finite costUsd values; null/NaN treated as 0.
 */
export function sumUsageCostUsd(rows: UsageCostRow[]): number {
  let total = 0;
  for (const r of rows) {
    const c = r.costUsd;
    if (typeof c === "number" && Number.isFinite(c) && c >= 0) {
      total += c;
    }
  }
  // Round to 6 decimals for stable money display
  return Math.round(total * 1_000_000) / 1_000_000;
}

/** Tasks that count toward a report's totalCostUsd rollup. */
export const REPORT_COST_TASKS = new Set([
  "explain",
  "explain-vision",
  "report-analysis",
  "web-search",
  "embedding",
  "intent-agent",
  // legacy rows written before explain split
  "vision-extract",
]);

export function sumReportAnalyzeCostUsd(rows: UsageCostRow[]): number {
  return sumUsageCostUsd(
    rows.filter((r) => !r.task || REPORT_COST_TASKS.has(r.task)),
  );
}
