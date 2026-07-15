/**
 * Quality-gate + dedupe regeneration loop (injectable deps for unit tests).
 */

export type QualityLoopQuestion = {
  text: string;
  topic: string;
  [key: string]: unknown;
};

export type QualityLoopDeps<T extends QualityLoopQuestion> = {
  generate: (count: number, round: number) => Promise<T[]>;
  isDuplicate: (q: T) => Promise<boolean>;
  validate: (q: T) => Promise<{ valid: boolean; reason: string }>;
  maxRounds?: number;
};

export type QualityLoopResult<T extends QualityLoopQuestion> = {
  accepted: T[];
  dropped: string[];
  requested: number;
  roundsUsed: number;
};

/**
 * Generate until `requested` accepted or rounds exhausted.
 * Never pads with invalid questions.
 */
export async function runQualityRegenLoop<T extends QualityLoopQuestion>(
  requested: number,
  deps: QualityLoopDeps<T>,
): Promise<QualityLoopResult<T>> {
  const maxRounds = deps.maxRounds ?? 2;
  const accepted: T[] = [];
  const dropped: string[] = [];
  let roundsUsed = 0;

  // maxRounds = number of *extra* regen attempts after the first pass
  // (0 = generate once only; 2 = up to 3 generate calls total)
  while (accepted.length < requested && roundsUsed <= maxRounds) {
    roundsUsed += 1;
    const need = requested - accepted.length;
    let batch: T[] = [];
    try {
      batch = await deps.generate(need, roundsUsed);
    } catch (err) {
      dropped.push(
        `generate_error:r${roundsUsed}:${err instanceof Error ? err.message : "fail"}`,
      );
      break;
    }

    for (const q of batch) {
      if (accepted.length >= requested) break;
      if (await deps.isDuplicate(q)) {
        dropped.push(`dup:${q.topic}:${q.text.slice(0, 40)}`);
        continue;
      }
      const gate = await deps.validate(q);
      if (!gate.valid) {
        dropped.push(`gate:${q.topic}:${gate.reason}`);
        continue;
      }
      accepted.push(q);
    }
  }

  return {
    accepted,
    dropped,
    requested,
    roundsUsed,
  };
}
