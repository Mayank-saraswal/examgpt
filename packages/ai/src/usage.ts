import type { AiTask } from "./registry";

export type AiUsageRecord = {
  userId: string | null;
  task: AiTask | string;
  model: string;
  tokensIn: number;
  tokensOut: number;
  costUsd: number | null;
  latencyMs: number;
};

export type UsageSink = {
  write: (row: AiUsageRecord) => Promise<void>;
  /** Sum of costUsd (or token proxy) for user since start of UTC day. Fail-open. */
  getUserDailySpendUsd: (userId: string) => Promise<number>;
};

let sink: UsageSink | null = null;

export function setUsageSink(next: UsageSink | null): void {
  sink = next;
}

export function getUsageSink(): UsageSink | null {
  return sink;
}

export function getDailyBudgetUsd(): number {
  const raw = process.env.AI_DAILY_BUDGET_USD;
  if (!raw) return 5; // default $5/user/day
  const n = Number(raw);
  return Number.isFinite(n) && n > 0 ? n : 5;
}

/** Rough USD estimate when provider does not return cost. */
export function estimateCostUsd(
  model: string,
  tokensIn: number,
  tokensOut: number,
): number {
  // Very rough defaults ($/1M tokens) — only for budgeting
  let inPerM = 1;
  let outPerM = 3;
  if (/mini|nano|flash|lite|sonar/i.test(model)) {
    inPerM = 0.15;
    outPerM = 0.6;
  } else if (/opus|sol|pro/i.test(model)) {
    inPerM = 5;
    outPerM = 25;
  }
  return (tokensIn * inPerM + tokensOut * outPerM) / 1_000_000;
}

export class DailyBudgetExceededError extends Error {
  readonly code = "TOO_MANY_REQUESTS" as const;
  constructor(userId: string, spent: number, cap: number) {
    super(
      `AI daily budget exceeded for user (${spent.toFixed(4)} / ${cap} USD). Try again tomorrow or raise AI_DAILY_BUDGET_USD.`,
    );
    this.name = "DailyBudgetExceededError";
    void userId;
  }
}

/**
 * Check per-user daily budget. Fail-open if sink missing or query errors.
 */
export async function assertUnderDailyBudget(userId: string | null | undefined): Promise<void> {
  if (!userId || !sink) return;
  try {
    const spent = await sink.getUserDailySpendUsd(userId);
    const cap = getDailyBudgetUsd();
    if (spent >= cap) {
      throw new DailyBudgetExceededError(userId, spent, cap);
    }
  } catch (err) {
    if (err instanceof DailyBudgetExceededError) throw err;
    // fail-open
    console.warn("[ai] daily budget check failed open", err);
  }
}

export async function logAiUsage(row: AiUsageRecord): Promise<void> {
  if (!sink) return;
  try {
    await sink.write(row);
  } catch (err) {
    console.warn("[ai] usage log write failed", err);
  }
}

/**
 * Wrap an AI call: budget check → time → log usage.
 */
export async function withAiUsage<T>(opts: {
  userId?: string | null;
  task: AiTask | string;
  model: string;
  run: () => Promise<T & { usage?: { inputTokens?: number; outputTokens?: number; promptTokens?: number; completionTokens?: number } }>;
  extractUsage?: (result: T) => { tokensIn: number; tokensOut: number; costUsd?: number | null };
}): Promise<T> {
  await assertUnderDailyBudget(opts.userId);
  const t0 = Date.now();
  const result = await opts.run();
  const latencyMs = Date.now() - t0;

  let tokensIn = 0;
  let tokensOut = 0;
  let costUsd: number | null = null;

  if (opts.extractUsage) {
    const u = opts.extractUsage(result);
    tokensIn = u.tokensIn;
    tokensOut = u.tokensOut;
    costUsd = u.costUsd ?? null;
  } else {
    const u = (result as { usage?: Record<string, number | undefined> }).usage;
    if (u) {
      tokensIn = u.inputTokens ?? u.promptTokens ?? 0;
      tokensOut = u.outputTokens ?? u.completionTokens ?? 0;
    }
  }

  if (costUsd == null) {
    costUsd = estimateCostUsd(opts.model, tokensIn, tokensOut);
  }

  await logAiUsage({
    userId: opts.userId ?? null,
    task: opts.task,
    model: opts.model,
    tokensIn,
    tokensOut,
    costUsd,
    latencyMs,
  });

  return result;
}
