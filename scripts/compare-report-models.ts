/**
 * Side-by-side report narrative generation for quality judgment.
 *
 *   bun scripts/compare-report-models.ts <attemptId> <modelId> [modelId…]
 *
 * Writes `.data/model-compare/{attemptId}/{safeModelId}.json` with narrative +
 * estimated cost from AiUsageLog rows written during each run.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { db } from "@examgpt/db";
import {
  clearRuntimeModelOverrides,
  generateReportNarrative,
  setRuntimeModelOverride,
  type QuestionAnalysisRow,
  type TopicAnalysisRow,
  type TimeAnalysis,
} from "@examgpt/ai";

function loadEnv() {
  const p = resolve(import.meta.dir, "../.env");
  if (!existsSync(p)) return;
  for (const line of readFileSync(p, "utf8").split(/\r?\n/)) {
    const t = line.trim();
    if (!t || t.startsWith("#")) continue;
    const i = t.indexOf("=");
    if (i < 0) continue;
    const k = t.slice(0, i).trim();
    let v = t.slice(i + 1).trim();
    if (
      (v.startsWith('"') && v.endsWith('"')) ||
      (v.startsWith("'") && v.endsWith("'"))
    ) {
      v = v.slice(1, -1);
    }
    if (!process.env[k]) process.env[k] = v;
  }
}
loadEnv();

function safeName(modelId: string) {
  return modelId.replace(/[^a-zA-Z0-9._-]+/g, "_");
}

async function main() {
  const attemptId = process.argv[2];
  const models = process.argv.slice(3);
  if (!attemptId || models.length === 0) {
    console.error(
      "Usage: bun scripts/compare-report-models.ts <attemptId> <modelId> [modelId…]",
    );
    process.exit(1);
  }

  const report = await db.report.findFirst({
    where: { attemptId },
    include: { attempt: { include: { test: true } } },
  });
  if (!report) throw new Error(`No report for attempt ${attemptId}`);

  const topics = (report.topicAnalysis ?? []) as TopicAnalysisRow[];
  const time = (report.timeAnalysis ?? {
    avgTimeSec: 0,
    medianTimeSec: 0,
    slowThresholdSec: 0,
    slowButCorrect: [],
    rushedWrong: [],
    confusedCount: 0,
  }) as TimeAnalysis;
  const questionSample = (report.questionAnalysis ??
    []) as QuestionAnalysisRow[];

  const outDir = resolve(
    import.meta.dir,
    `../.data/model-compare/${attemptId}`,
  );
  mkdirSync(outDir, { recursive: true });

  const index: {
    attemptId: string;
    models: { modelId: string; path: string; costUsd: number | null }[];
  } = { attemptId, models: [] };

  for (const modelId of models) {
    console.log(`Generating narrative with ${modelId}…`);
    clearRuntimeModelOverrides();
    setRuntimeModelOverride("report-analysis", modelId);
    const t0 = Date.now();
    const before = new Date();
    let narrative;
    let err: string | null = null;
    try {
      narrative = await generateReportNarrative({
        userId: report.userId,
        examType: report.attempt.test.source,
        score: report.score ?? 0,
        maxScore: report.maxScore ?? 0,
        topics,
        time,
        questionSample: questionSample.slice(0, 30),
      });
    } catch (e) {
      err = e instanceof Error ? e.message : String(e);
      narrative = null;
    }
    const after = new Date();
    const logs = await db.aiUsageLog.findMany({
      where: {
        userId: report.userId,
        task: "report-analysis",
        createdAt: { gte: before, lte: after },
      },
      select: { costUsd: true, tokensIn: true, tokensOut: true, model: true },
    });
    const costUsd = logs.reduce((s, r) => s + (r.costUsd ?? 0), 0);
    const file = join(outDir, `${safeName(modelId)}.json`);
    const payload = {
      modelId,
      latencyMs: Date.now() - t0,
      costUsd: Math.round(costUsd * 1e6) / 1e6,
      usage: logs,
      error: err,
      narrative,
    };
    writeFileSync(file, JSON.stringify(payload, null, 2));
    index.models.push({
      modelId,
      path: file,
      costUsd: payload.costUsd,
    });
    console.log(
      `  → ${file} cost=$${payload.costUsd} err=${err ?? "none"}`,
    );
  }

  clearRuntimeModelOverrides();
  writeFileSync(join(outDir, "index.json"), JSON.stringify(index, null, 2));
  console.log(`Done. Index: ${join(outDir, "index.json")}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
