import type { RequestHandler } from "express";
import rateLimit from "express-rate-limit";
import helmet from "helmet";
import { randomUUID } from "node:crypto";

/**
 * Phase 7 — request hardening: Helmet, JSON size caps, request IDs, rate limits.
 */

export const securityHeaders = helmet({
  // API server — no CSP for HTML; clients own that.
  contentSecurityPolicy: false,
  crossOriginResourcePolicy: { policy: "cross-origin" },
});

/** Attach X-Request-Id (client or generated) for structured log correlation. */
export const requestIdMiddleware: RequestHandler = (req, res, next) => {
  const incoming = req.header("x-request-id")?.trim();
  const id =
    incoming && incoming.length > 0 && incoming.length <= 128
      ? incoming
      : randomUUID();
  req.headers["x-request-id"] = id;
  res.setHeader("X-Request-Id", id);
  next();
};

/**
 * Global rate limit (IP-based). Skips Inngest + Clerk webhooks (high-volume
 * internal traffic — each step.run is a separate request).
 */
export const globalRateLimit = rateLimit({
  windowMs: 60_000,
  limit: Number(process.env.RATE_LIMIT_GLOBAL_PER_MIN ?? 300) || 300,
  standardHeaders: "draft-7",
  legacyHeaders: false,
  message: { error: "Too many requests", code: "TOO_MANY_REQUESTS" },
  skip: (req) => {
    const p = req.path ?? req.url ?? "";
    return (
      p.startsWith("/api/inngest") ||
      p.startsWith("/webhooks/") ||
      p === "/health"
    );
  },
});

/** Stricter limit for expensive AI / ingest entrypoints. */
export const expensiveRateLimit = rateLimit({
  windowMs: 60_000,
  limit: Number(process.env.RATE_LIMIT_EXPENSIVE_PER_MIN ?? 30) || 30,
  standardHeaders: "draft-7",
  legacyHeaders: false,
  message: { error: "Too many expensive requests", code: "TOO_MANY_REQUESTS" },
});

/** Chat stream — slightly higher than expensive but still capped. */
export const chatStreamRateLimit = rateLimit({
  windowMs: 60_000,
  limit: Number(process.env.RATE_LIMIT_CHAT_PER_MIN ?? 60) || 60,
  standardHeaders: "draft-7",
  legacyHeaders: false,
  message: { error: "Chat rate limit exceeded", code: "TOO_MANY_REQUESTS" },
});
