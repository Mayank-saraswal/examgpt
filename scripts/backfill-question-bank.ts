/**
 * Backfill Qdrant question_bank from existing Postgres tests/questions
 * and set wasCorrect from attempt Responses (latest graded response wins).
 *
 * Usage (repo root, docker Qdrant + DATABASE_URL):
 *   bun run scripts/backfill-question-bank.ts
 *   bun run scripts/backfill-question-bank.ts --user=user_xxx
 */
import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import { db } from "@examgpt/db";

function loadEnv() {
  const p = resolve(import.meta.dir, "../.env");
  if (!existsSync(p)) throw new Error("Missing .env");
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
    if (!(k in process.env) || !process.env[k]) process.env[k] = v;
  }
}
loadEnv();

const userArg = process.argv.find((a) => a.startsWith("--user="));
const USER_FILTER = userArg?.split("=")[1];

async function main() {
  const {
    ensureQuestionBankCollection,
    upsertQuestionBankItems,
    updateQuestionBankWasCorrect,
  } = await import("../apps/server/src/qdrant/question-bank.ts");

  await ensureQuestionBankCollection();
  console.log("question_bank collection ready");

  const tests = await db.test.findMany({
    where: {
      deletedAt: null,
      ...(USER_FILTER ? { userId: USER_FILTER } : {}),
    },
    include: {
      questions: { orderBy: { index: "asc" } },
    },
  });
  console.log(`Found ${tests.length} tests`);

  let upserted = 0;
  for (const t of tests) {
    if (t.questions.length === 0) continue;
    const items = t.questions.map((q) => ({
      userId: t.userId,
      testId: t.id,
      questionIndex: q.index,
      topic: q.topic ?? q.section ?? "Untagged",
      text: q.text,
      wasCorrect: null as boolean | null,
    }));
    try {
      const n = await upsertQuestionBankItems(items);
      upserted += n;
      console.log(`  test ${t.id}: upserted ${n} questions`);
    } catch (err) {
      console.error(`  test ${t.id} FAILED`, err);
    }
  }

  // Latest wasCorrect from graded responses
  const responses = await db.response.findMany({
    where: {
      isCorrect: { not: null },
      attempt: USER_FILTER ? { userId: USER_FILTER } : undefined,
    },
    include: {
      attempt: { select: { testId: true, userId: true, submittedAt: true } },
    },
    orderBy: { updatedAt: "desc" },
  });

  // Keep first (latest) per testId:questionIndex
  const seen = new Set<string>();
  let correctness = 0;
  for (const r of responses) {
    const key = `${r.attempt.testId}:${r.questionIndex}`;
    if (seen.has(key)) continue;
    seen.add(key);
    const ok = await updateQuestionBankWasCorrect({
      testId: r.attempt.testId,
      questionIndex: r.questionIndex,
      wasCorrect: r.isCorrect,
    });
    if (ok) correctness += 1;
  }

  console.log(
    JSON.stringify(
      {
        tests: tests.length,
        questionsUpserted: upserted,
        wasCorrectUpdated: correctness,
      },
      null,
      2,
    ),
  );
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
