import { describe, expect, it } from "vitest";
import { checkAttemptOpen, computeEndsAt } from "./timer";

describe("checkAttemptOpen", () => {
  it("allows before endsAt", () => {
    const started = new Date("2026-01-01T10:00:00Z");
    const ends = computeEndsAt(started, 60);
    const now = new Date("2026-01-01T10:30:00Z");
    const r = checkAttemptOpen(ends, now, 5);
    expect(r.ok).toBe(true);
  });

  it("allows within grace after endsAt", () => {
    const ends = new Date("2026-01-01T11:00:00Z");
    const now = new Date("2026-01-01T11:00:03Z");
    expect(checkAttemptOpen(ends, now, 5).ok).toBe(true);
  });

  it("rejects after grace", () => {
    const ends = new Date("2026-01-01T11:00:00Z");
    const now = new Date("2026-01-01T11:00:06Z");
    const r = checkAttemptOpen(ends, now, 5);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe("EXPIRED");
  });
});
