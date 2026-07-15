import { describe, expect, it } from "vitest";
import {
  chatStreamRateLimit,
  expensiveRateLimit,
  globalRateLimit,
  requestIdMiddleware,
  securityHeaders,
} from "./security";

describe("security middleware exports", () => {
  it("exports middleware functions", () => {
    expect(typeof securityHeaders).toBe("function");
    expect(typeof requestIdMiddleware).toBe("function");
    expect(typeof globalRateLimit).toBe("function");
    expect(typeof expensiveRateLimit).toBe("function");
    expect(typeof chatStreamRateLimit).toBe("function");
  });

  it("requestIdMiddleware sets header", () => {
    const headers: Record<string, string> = {};
    const req = {
      header: (k: string) =>
        k.toLowerCase() === "x-request-id" ? undefined : undefined,
      headers: {} as Record<string, string>,
    };
    const res = {
      setHeader: (k: string, v: string) => {
        headers[k] = v;
      },
    };
    let nextCalled = false;
    requestIdMiddleware(req as never, res as never, () => {
      nextCalled = true;
    });
    expect(nextCalled).toBe(true);
    expect(headers["X-Request-Id"]).toMatch(
      /^[0-9a-f-]{36}$/i,
    );
    expect(req.headers["x-request-id"]).toBe(headers["X-Request-Id"]);
  });
});
