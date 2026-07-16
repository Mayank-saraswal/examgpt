/**
 * Study streak: consecutive calendar days (Asia/Kolkata) with activity.
 * Activity = any of: chat message, document created, attempt submitted.
 */

const IST = "Asia/Kolkata";

/** Format a Date as YYYY-MM-DD in IST. */
export function toIstDateKey(d: Date): string {
  // en-CA yields YYYY-MM-DD
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: IST,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(d);
}

/**
 * Consecutive-day streak ending at `now` (IST).
 * - Days with activity in the set count.
 * - If today (IST) has no activity, streak may still count from yesterday
 *   (user remains "on a streak" until the day ends without activity).
 * - A gap of a full day without activity breaks the streak.
 */
export function computeStudyStreak(
  activityTimestamps: Array<Date | string | number>,
  now: Date = new Date(),
): number {
  if (activityTimestamps.length === 0) return 0;

  const days = new Set<string>();
  for (const t of activityTimestamps) {
    const d = t instanceof Date ? t : new Date(t);
    if (Number.isNaN(d.getTime())) continue;
    days.add(toIstDateKey(d));
  }
  if (days.size === 0) return 0;

  const todayKey = toIstDateKey(now);
  // Walk backward day-by-day in IST using noon UTC offsets is fragile;
  // use sequential Date mutations via known IST offset approximation:
  // convert "today" to a Date at IST midnight by parsing the key.
  let cursor = parseIstDateKey(todayKey);

  // If today empty, start from yesterday (still show streak through today)
  if (!days.has(todayKey)) {
    cursor = addIstDays(cursor, -1);
    if (!days.has(toIstDateKey(cursor))) return 0;
  }

  let streak = 0;
  // Safety cap
  for (let i = 0; i < 4000; i++) {
    const key = toIstDateKey(cursor);
    if (!days.has(key)) break;
    streak += 1;
    cursor = addIstDays(cursor, -1);
  }
  return streak;
}

function parseIstDateKey(key: string): Date {
  // Treat as UTC noon then rely on IST format for stepping via addIstDays
  const [y, m, d] = key.split("-").map(Number);
  return new Date(Date.UTC(y!, m! - 1, d!, 6, 30, 0)); // ~IST midnight as UTC
}

function addIstDays(d: Date, delta: number): Date {
  const next = new Date(d.getTime());
  next.setUTCDate(next.getUTCDate() + delta);
  return next;
}
