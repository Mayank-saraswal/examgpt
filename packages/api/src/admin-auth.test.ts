import { describe, expect, it } from "vitest";
import { isAdminUser, normalizeAdminUserIds } from "./context";

describe("normalizeAdminUserIds", () => {
  it("parses comma-separated list", () => {
    expect(normalizeAdminUserIds("user_a, user_b ,user_c")).toEqual([
      "user_a",
      "user_b",
      "user_c",
    ]);
  });
  it("handles arrays and empty", () => {
    expect(normalizeAdminUserIds(["user_x", ""])).toEqual(["user_x"]);
    expect(normalizeAdminUserIds(null)).toEqual([]);
    expect(normalizeAdminUserIds(undefined)).toEqual([]);
  });
});

describe("isAdminUser (adminProcedure dual gate)", () => {
  const allow = ["user_admin1", "user_admin2"];

  it("allows only when role=admin AND allowlist match", () => {
    expect(
      isAdminUser({
        userId: "user_admin1",
        role: "admin",
        adminUserIds: allow,
      }),
    ).toBe(true);
  });

  it("FORBIDDEN when role is not admin", () => {
    expect(
      isAdminUser({
        userId: "user_admin1",
        role: "member",
        adminUserIds: allow,
      }),
    ).toBe(false);
    expect(
      isAdminUser({
        userId: "user_admin1",
        role: null,
        adminUserIds: allow,
      }),
    ).toBe(false);
  });

  it("FORBIDDEN when allowlist mismatch", () => {
    expect(
      isAdminUser({
        userId: "user_other",
        role: "admin",
        adminUserIds: allow,
      }),
    ).toBe(false);
  });

  it("FORBIDDEN when no userId", () => {
    expect(
      isAdminUser({
        userId: null,
        role: "admin",
        adminUserIds: allow,
      }),
    ).toBe(false);
  });
});

describe("platform visibility filter by exam profile", () => {
  /**
   * Mirrors tests.listPlatformPapers where clause construction.
   */
  function platformWhere(examType: "NEET" | "JEE" | "OTHER" | null) {
    return {
      visibility: "PLATFORM" as const,
      deletedAt: null,
      status: "READY" as const,
      publishedAt: { not: null },
      ...(examType ? { examType } : {}),
    };
  }

  it("filters NEET users to NEET papers", () => {
    const w = platformWhere("NEET");
    expect(w.examType).toBe("NEET");
    expect(w.visibility).toBe("PLATFORM");
    expect(w.publishedAt).toEqual({ not: null });
  });

  it("omits examType filter when profile missing", () => {
    const w = platformWhere(null);
    expect("examType" in w).toBe(false);
  });
});

describe("question_bank write-timing (platform vs private)", () => {
  function shouldWriteBankAtExtract(visibility: "PRIVATE" | "PLATFORM") {
    return visibility !== "PLATFORM";
  }

  function shouldWriteBankAtAnalyze(visibility: "PRIVATE" | "PLATFORM") {
    // Both write at analyze; platform always full upsert
    return true;
  }

  it("extract does not write for PLATFORM", () => {
    expect(shouldWriteBankAtExtract("PLATFORM")).toBe(false);
    expect(shouldWriteBankAtExtract("PRIVATE")).toBe(true);
  });

  it("analyze writes for both", () => {
    expect(shouldWriteBankAtAnalyze("PLATFORM")).toBe(true);
    expect(shouldWriteBankAtAnalyze("PRIVATE")).toBe(true);
  });
});
