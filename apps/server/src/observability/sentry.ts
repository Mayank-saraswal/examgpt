/**
 * Phase 7 — optional Sentry. No-ops unless SENTRY_DSN is set.
 */
import { logger } from "../logger";

type CaptureFn = (err: unknown, context?: Record<string, unknown>) => void;
type MessageFn = (msg: string, level?: string) => void;

let captureEx: CaptureFn | null = null;
let captureMsg: MessageFn | null = null;
let initTried = false;

export function initSentry(): void {
  if (initTried) return;
  initTried = true;
  const dsn = process.env.SENTRY_DSN?.trim();
  if (!dsn) {
    logger.debug("Sentry disabled (SENTRY_DSN not set)");
    return;
  }
  void import("@sentry/node")
    .then((Sentry) => {
      Sentry.init({
        dsn,
        environment: process.env.NODE_ENV ?? "development",
        tracesSampleRate: Number(process.env.SENTRY_TRACES_SAMPLE_RATE ?? 0.1),
      });
      captureEx = (err, context) => {
        Sentry.captureException(err, context ? { extra: context } : undefined);
      };
      captureMsg = (msg, level) => {
        Sentry.captureMessage(msg, (level as "error") ?? "error");
      };
      logger.info("Sentry initialized for server");
    })
    .catch((err) => {
      logger.warn({ err }, "Failed to init @sentry/node");
    });
}

export function captureException(
  err: unknown,
  context?: Record<string, unknown>,
): void {
  captureEx?.(err, context);
  logger.error({ err, ...context }, "captured exception");
}

export function captureMessage(
  msg: string,
  level: "info" | "warning" | "error" = "error",
): void {
  captureMsg?.(msg, level);
  if (level === "warning") logger.warn(msg);
  else if (level === "error") logger.error(msg);
  else logger.info(msg);
}
