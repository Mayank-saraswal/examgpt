import { describe, expect, it } from "vitest";
import { computeStudyStreak, toIstDateKey } from "./streak";

describe("toIstDateKey", () => {
  it("formats in Asia/Kolkata", () => {
    // 2026-07-15 20:00 UTC = 2026-07-16 01:30 IST
    const d = new Date("2026-07-15T20:00:00.000Z");
    expect(toIstDateKey(d)).toBe("2026-07-16");
  });
});

describe("computeStudyStreak", () => {
  // Fixed "now" = 2026-07-16 12:00 IST ≈ 2026-07-16 06:30 UTC
  const now = new Date("2026-07-16T06:30:00.000Z");

  it("returns 0 with no activity", () => {
    expect(computeStudyStreak([], now)).toBe(0);
  });

  it("counts consecutive days ending today", () => {
    const times = [
      new Date("2026-07-16T03:00:00.000Z"), // today IST
      new Date("2026-07-15T10:00:00.000Z"), // yesterday IST
      new Date("2026-07-14T10:00:00.000Z"),
    ];
    expect(computeStudyStreak(times, now)).toBe(3);
  });

  it("continues streak if today empty but yesterday active", () => {
    const times = [
      new Date("2026-07-15T10:00:00.000Z"),
      new Date("2026-07-14T10:00:00.000Z"),
    ];
    expect(computeStudyStreak(times, now)).toBe(2);
  });

  it("breaks on a gap", () => {
    const times = [
      new Date("2026-07-16T03:00:00.000Z"),
      // missing 15
      new Date("2026-07-14T10:00:00.000Z"),
    ];
    expect(computeStudyStreak(times, now)).toBe(1);
  });

  it("dedupes multiple events same IST day", () => {
    const times = [
      new Date("2026-07-16T01:00:00.000Z"),
      new Date("2026-07-16T08:00:00.000Z"),
      new Date("2026-07-15T12:00:00.000Z"),
    ];
    expect(computeStudyStreak(times, now)).toBe(2);
  });

  it("returns 0 when yesterday also empty", () => {
    const times = [new Date("2026-07-10T10:00:00.000Z")];
    expect(computeStudyStreak(times, now)).toBe(0);
  });
});
