import { createHash } from "node:crypto";

/**
 * Deterministic point ID from testId:questionIndex (TASKS.md §5).
 * Pure — safe for unit tests without server env.
 */
export function questionBankPointId(
  testId: string,
  questionIndex: number,
): string {
  const h = createHash("sha1")
    .update(`${testId}:${questionIndex}`)
    .digest();
  const hex = h.subarray(0, 16).toString("hex");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20, 32)}`;
}
