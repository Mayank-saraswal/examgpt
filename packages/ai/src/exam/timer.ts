/**
 * Server-authoritative attempt timer helpers.
 * Never trust client clock for expiry.
 */

export type TimerCheckResult =
  | { ok: true; remainingMs: number }
  | { ok: false; reason: "EXPIRED"; remainingMs: number };

/**
 * @param endsAt server-computed deadline
 * @param now server now
 * @param graceSec small grace after endsAt (late events)
 */
export function checkAttemptOpen(
  endsAt: Date,
  now: Date = new Date(),
  graceSec = 5,
): TimerCheckResult {
  const hardDeadline = endsAt.getTime() + graceSec * 1000;
  const remainingMs = endsAt.getTime() - now.getTime();
  if (now.getTime() > hardDeadline) {
    return { ok: false, reason: "EXPIRED", remainingMs };
  }
  return { ok: true, remainingMs: Math.max(0, remainingMs) };
}

export function computeEndsAt(startedAt: Date, durationMin: number): Date {
  return new Date(startedAt.getTime() + durationMin * 60_000);
}

/** Client should resync server offset every 60s */
export const TIMER_RESYNC_MS = 60_000;
