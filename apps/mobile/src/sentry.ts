/**
 * Phase 7 — optional Sentry for Expo. No-ops unless EXPO_PUBLIC_SENTRY_DSN is set.
 */
export function initMobileSentry(): void {
  const dsn = process.env.EXPO_PUBLIC_SENTRY_DSN?.trim();
  if (!dsn) return;
  try {
    // Optional dependency — install @sentry/react-native for production
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const Sentry = require("@sentry/react-native") as {
      init: (o: Record<string, unknown>) => void;
    };
    Sentry.init({
      dsn,
      tracesSampleRate: 0.1,
      enableAutoSessionTracking: true,
    });
  } catch {
    console.warn(
      "[sentry] EXPO_PUBLIC_SENTRY_DSN set but @sentry/react-native not installed",
    );
  }
}
