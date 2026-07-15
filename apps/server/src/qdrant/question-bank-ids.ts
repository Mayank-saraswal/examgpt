import { createHash } from "node:crypto";

/**
 * Deterministic point ID from userId:testId:questionIndex.
 * Includes userId so platform PYQs can store per-attempting-user bank rows
 * without colliding (HARD INVARIANT: bank rows are user-scoped).
 * Pure — safe for unit tests without server env.
 */
export function questionBankPointId(
  testId: string,
  questionIndex: number,
  userId?: string,
): string {
  const key =
    userId != null && userId.length > 0
      ? `${userId}:${testId}:${questionIndex}`
      : `${testId}:${questionIndex}`;
  const h = createHash("sha1").update(key).digest();
  const hex = h.subarray(0, 16).toString("hex");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20, 32)}`;
}
