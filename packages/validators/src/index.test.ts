import { describe, expect, it } from "vitest";
import { healthPingOutput } from "./index";

describe("healthPingOutput", () => {
  it("accepts a valid payload", () => {
    const parsed = healthPingOutput.parse({
      ok: true,
      service: "examgpt-api",
      timestamp: new Date().toISOString(),
    });
    expect(parsed.ok).toBe(true);
  });

  it("rejects ok: false", () => {
    expect(() =>
      healthPingOutput.parse({
        ok: false,
        service: "x",
        timestamp: "t",
      }),
    ).toThrow();
  });
});
