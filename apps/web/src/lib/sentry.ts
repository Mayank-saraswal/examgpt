/**
 * Phase 7 — optional Sentry for web. No-ops unless NEXT_PUBLIC_SENTRY_DSN is set.
 * Package is optional: install `@sentry/nextjs` for production.
 */
export function initWebSentry(): void {
  if (typeof window === "undefined") return;
  const dsn = process.env.NEXT_PUBLIC_SENTRY_DSN?.trim();
  if (!dsn) return;
  const load = new Function(
    "return import('@sentry/nextjs')",
  ) as () => Promise<{
    init: (o: Record<string, unknown>) => void;
  }>;
  void load()
    .then((Sentry) => {
      Sentry.init({
        dsn,
        environment: process.env.NODE_ENV,
        tracesSampleRate: 0.1,
      });
    })
    .catch(() => {
      console.warn(
        "[sentry] NEXT_PUBLIC_SENTRY_DSN set but @sentry/nextjs not installed",
      );
    });
}

export function captureWebException(err: unknown): void {
  const load = new Function(
    "return import('@sentry/nextjs')",
  ) as () => Promise<{
    captureException: (e: unknown) => void;
  }>;
  void load()
    .then((Sentry) => Sentry.captureException(err))
    .catch(() => {
      console.error(err);
    });
}
