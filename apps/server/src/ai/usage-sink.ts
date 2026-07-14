import { db } from "@examgpt/db";
import type { UsageSink } from "@examgpt/ai";

/**
 * Prisma-backed AiUsageLog sink + daily spend sum (UTC day).
 */
export function createPrismaUsageSink(): UsageSink {
  return {
    async write(row) {
      await db.aiUsageLog.create({
        data: {
          userId: row.userId,
          task: String(row.task),
          model: row.model,
          tokensIn: row.tokensIn,
          tokensOut: row.tokensOut,
          costUsd: row.costUsd,
          latencyMs: row.latencyMs,
        },
      });
    },
    async getUserDailySpendUsd(userId) {
      const start = new Date();
      start.setUTCHours(0, 0, 0, 0);
      const agg = await db.aiUsageLog.aggregate({
        where: {
          userId,
          createdAt: { gte: start },
        },
        _sum: { costUsd: true },
      });
      return agg._sum.costUsd ?? 0;
    },
  };
}
