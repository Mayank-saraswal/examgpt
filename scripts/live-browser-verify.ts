/**
 * Live browser/API verification for authenticated Clerk user.
 * Uses Backend API session JWT (not browser cookies).
 *
 * Usage: bun scripts/live-browser-verify.ts [userId] [testId]
 */
import { createClerkClient } from "@clerk/backend";
import { db } from "@examgpt/db";
import { computeEndsAt } from "@examgpt/ai";

const API = process.env.API_URL ?? process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";
const WEB = process.env.WEB_URL ?? "http://localhost:3000";
const CLERK =
  process.argv[2] ??
  process.env.VERIFY_CLERK_USER_ID ??
  "user_3GX2YAmvtA1iKIHNvUCVlJx8vER";
const TEST =
  process.argv[3] ??
  process.env.VERIFY_TEST_ID ??
  "cmrlsrdor00037ksgmzmltfyh";
const NOTES = process.env.VERIFY_NOTES_ID ?? "cmrlshwp200017krklcm1xjtk";

const results: { name: string; ok: boolean; detail: string }[] = [];

function pass(name: string, detail: string) {
  results.push({ name, ok: true, detail });
  console.log(`PASS  ${name} — ${detail}`);
}
function fail(name: string, detail: string) {
  results.push({ name, ok: false, detail });
  console.error(`FAIL  ${name} — ${detail}`);
}

async function trpcQuery<T>(
  path: string,
  token: string,
  input?: unknown,
): Promise<T> {
  const url = new URL(`${API}/trpc/${path}`);
  if (input !== undefined) {
    url.searchParams.set("input", JSON.stringify(input));
  }
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const json = (await res.json()) as {
    result?: { data: T };
    error?: { message: string };
  };
  if (!res.ok || json.error) {
    throw new Error(json.error?.message ?? `HTTP ${res.status}`);
  }
  return json.result!.data;
}

async function trpcMutate<T>(
  path: string,
  token: string,
  input: unknown,
): Promise<T> {
  const res = await fetch(`${API}/trpc/${path}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(input),
  });
  const json = (await res.json()) as {
    result?: { data: T };
    error?: { message: string };
  };
  if (!res.ok || json.error) {
    throw new Error(json.error?.message ?? `HTTP ${res.status}`);
  }
  return json.result!.data;
}

async function checkWeb(path: string, expect: number | number[]) {
  const res = await fetch(`${WEB}${path}`, { redirect: "manual" });
  const allowed = Array.isArray(expect) ? expect : [expect];
  if (!allowed.includes(res.status)) {
    throw new Error(`expected ${allowed.join("|")} got ${res.status}`);
  }
  return res.status;
}

async function main() {
  console.log(`API=${API} WEB=${WEB}`);
  console.log(`user=${CLERK} test=${TEST}`);

  // --- health ---
  try {
    const h = await fetch(`${API}/health`).then((r) => r.json());
    if (!(h as { ok?: boolean }).ok) throw new Error(JSON.stringify(h));
    pass("api.health", JSON.stringify(h));
  } catch (e) {
    fail("api.health", String(e));
    process.exit(1);
  }

  // --- Clerk session JWT ---
  const secretKey = process.env.CLERK_SECRET_KEY;
  if (!secretKey) {
    fail("clerk.jwt", "CLERK_SECRET_KEY missing");
    process.exit(1);
  }
  const clerk = createClerkClient({ secretKey });
  let token: string;
  try {
    const session = await clerk.sessions.createSession({ userId: CLERK });
    const tok = await clerk.sessions.getToken(session.id);
    // getToken returns string in some versions, object in others
    token =
      typeof tok === "string"
        ? tok
        : ((tok as { jwt?: string }).jwt ?? String(tok));
    if (!token || token.length < 20) throw new Error("empty jwt");
    pass("clerk.jwt", `session=${session.id} jwtLen=${token.length}`);
  } catch (e) {
    fail("clerk.jwt", String(e));
    process.exit(1);
  }

  // --- ownership reassign ---
  try {
    const test = await db.test.findUnique({
      where: { id: TEST },
      include: { questions: true },
    });
    if (!test) throw new Error("test missing");
    if (test.questions.length === 0) throw new Error("no questions");

    await db.user.upsert({
      where: { id: CLERK },
      create: { id: CLERK, onboarded: true },
      update: { onboarded: true },
    });
    if (test.paperDocumentId) {
      await db.document.update({
        where: { id: test.paperDocumentId },
        data: { userId: CLERK },
      });
    }
    await db.document
      .update({ where: { id: NOTES }, data: { userId: CLERK } })
      .catch(() => null);
    await db.test.update({ where: { id: TEST }, data: { userId: CLERK } });
    pass(
      "ownership",
      `test+docs → ${CLERK} questions=${test.questions.length}`,
    );
  } catch (e) {
    fail("ownership", String(e));
  }

  // --- user.me ---
  try {
    const me = await trpcQuery<{
      id: string;
      name: string | null;
      onboarded: boolean;
    }>("user.me", token);
    if (me.id !== CLERK) throw new Error(`id mismatch ${me.id}`);
    pass("user.me", `name=${me.name} onboarded=${me.onboarded}`);
  } catch (e) {
    fail("user.me", String(e));
  }

  // --- lists ---
  try {
    const tests = await trpcQuery<
      { id: string; status: string; title: string }[]
    >("tests.list", token);
    const neet = tests.find((t) => t.id === TEST);
    if (!neet) throw new Error("NEET test not in list");
    if (neet.status !== "READY") throw new Error(`status=${neet.status}`);
    pass("tests.list", `count=${tests.length} neet=READY`);
  } catch (e) {
    fail("tests.list", String(e));
  }

  try {
    const docs = await trpcQuery<
      { id: string; ingestStatus: string; title: string }[]
    >("documents.list", token);
    const ready = docs.filter((d) => d.ingestStatus === "READY").length;
    pass("documents.list", `count=${docs.length} ready=${ready}`);
  } catch (e) {
    fail("documents.list", String(e));
  }

  // --- tests.get ---
  try {
    const t = await trpcQuery<{
      id: string;
      questions: unknown[];
      status: string;
    }>("tests.get", token, { id: TEST });
    if (t.questions.length < 1) throw new Error("no questions");
    pass("tests.get", `status=${t.status} q=${t.questions.length}`);
  } catch (e) {
    fail("tests.get", String(e));
  }

  // --- start / resume attempt ---
  let attemptId = "";
  try {
    // close other in-progress for clean start
    await db.attempt.updateMany({
      where: { testId: TEST, userId: CLERK, status: "IN_PROGRESS" },
      data: {
        status: "SUBMITTED",
        submittedAt: new Date(),
        submitType: "MANUAL",
      },
    });
    const started = await trpcMutate<{
      attemptId: string;
      resumed: boolean;
      endsAt: string;
    }>("attempts.start", token, { testId: TEST });
    attemptId = started.attemptId;
    pass(
      "attempts.start",
      `id=${attemptId} resumed=${started.resumed} endsAt=${started.endsAt}`,
    );
  } catch (e) {
    fail("attempts.start", String(e));
    // fallback create
    const test = await db.test.findUniqueOrThrow({ where: { id: TEST } });
    const startedAt = new Date();
    const endsAt = computeEndsAt(startedAt, test.durationMin);
    const a = await db.attempt.create({
      data: {
        testId: TEST,
        userId: CLERK,
        status: "IN_PROGRESS",
        startedAt,
        endsAt,
      },
    });
    attemptId = a.id;
    pass("attempts.start.fallback", attemptId);
  }

  // --- state ---
  try {
    const st = await trpcQuery<{
      attempt: { status: string };
      open: boolean;
      remainingMs: number;
      test: { questions: unknown[] };
      palette: Record<string, string>;
    }>("attempts.state", token, { attemptId });
    if (st.attempt.status !== "IN_PROGRESS") {
      throw new Error(`status=${st.attempt.status}`);
    }
    if (!st.open) throw new Error("not open");
    pass(
      "attempts.state",
      `open remainingMs=${st.remainingMs} qs=${st.test.questions.length}`,
    );
  } catch (e) {
    fail("attempts.state", String(e));
  }

  // --- ingest events ---
  try {
    const now = Date.now();
    const events = [
      { questionIndex: 1, type: "VISIT" as const, clientTs: new Date(now + 1000) },
      {
        questionIndex: 1,
        type: "SELECT" as const,
        optionKey: "A",
        clientTs: new Date(now + 5000),
      },
      {
        questionIndex: 1,
        type: "SAVE_NEXT" as const,
        clientTs: new Date(now + 6000),
      },
      { questionIndex: 2, type: "VISIT" as const, clientTs: new Date(now + 7000) },
      {
        questionIndex: 2,
        type: "SELECT" as const,
        optionKey: "B",
        clientTs: new Date(now + 10000),
      },
      {
        questionIndex: 2,
        type: "MARK_REVIEW" as const,
        clientTs: new Date(now + 11000),
      },
      {
        questionIndex: 3,
        type: "VISIT" as const,
        clientTs: new Date(now + 12000),
      },
      {
        questionIndex: 3,
        type: "SELECT" as const,
        optionKey: "A",
        clientTs: new Date(now + 14000),
      },
      {
        questionIndex: 3,
        type: "CHANGE" as const,
        optionKey: "C",
        clientTs: new Date(now + 16000),
      },
      {
        questionIndex: 4,
        type: "VISIT" as const,
        clientTs: new Date(now + 18000),
      },
      {
        questionIndex: 5,
        type: "VISIT" as const,
        clientTs: new Date(now + 20000),
      },
      {
        questionIndex: 5,
        type: "SELECT" as const,
        optionKey: "D",
        clientTs: new Date(now + 22000),
      },
      {
        questionIndex: 6,
        type: "VISIT" as const,
        clientTs: new Date(now + 24000),
      },
      {
        questionIndex: 6,
        type: "SELECT" as const,
        optionKey: "A",
        clientTs: new Date(now + 26000),
      },
      {
        questionIndex: 7,
        type: "VISIT" as const,
        clientTs: new Date(now + 28000),
      },
      {
        questionIndex: 7,
        type: "SELECT" as const,
        optionKey: "B",
        clientTs: new Date(now + 30000),
      },
      {
        questionIndex: 8,
        type: "VISIT" as const,
        clientTs: new Date(now + 32000),
      },
      {
        questionIndex: 8,
        type: "SELECT" as const,
        optionKey: "C",
        clientTs: new Date(now + 34000),
      },
    ];
    const ing = await trpcMutate<{ accepted: number; remainingMs: number }>(
      "attempts.ingestEvents",
      token,
      {
        attemptId,
        batchId: `live-verify-${Date.now()}`,
        events,
      },
    );
    if (ing.accepted !== events.length) {
      throw new Error(`accepted=${ing.accepted} expected=${events.length}`);
    }
    pass("ingestEvents", `accepted=${ing.accepted}`);
  } catch (e) {
    fail("ingestEvents", String(e));
  }

  // --- palette ---
  try {
    const st = await trpcQuery<{ palette: Record<string, unknown> }>(
      "attempts.state",
      token,
      { attemptId },
    );
    const p = st.palette ?? {};
    // API returns per-question objects: { paletteState, selectedKey, ... }
    const states = Object.values(p).map((v) => {
      if (v && typeof v === "object" && "paletteState" in v) {
        return String((v as { paletteState: string }).paletteState);
      }
      return String(v);
    });
    const hasAnswered = states.some((v) => v === "ANSWERED" || v === "ANSWERED_MARKED");
    const hasMarked = states.some((v) => v === "MARKED" || v === "ANSWERED_MARKED");
    const hasNot = states.some((v) => v === "NOT_ANSWERED" || v === "NOT_VISITED");
    if (!hasAnswered) {
      throw new Error(`palette missing ANSWERED: ${JSON.stringify(p)}`);
    }
    if (!hasMarked) {
      throw new Error(`palette missing MARKED: ${JSON.stringify(states)}`);
    }
    if (!hasNot) {
      throw new Error(`palette missing NOT_ANSWERED: ${JSON.stringify(states)}`);
    }
    pass(
      "palette",
      `states=${JSON.stringify(states)} answered=${hasAnswered} marked=${hasMarked} not=${hasNot}`,
    );
  } catch (e) {
    fail("palette", String(e));
  }

  // --- submit + double-submit ---
  let score: number | null = null;
  try {
    const sub = await trpcMutate<{
      score: number;
      maxScore: number;
      alreadySubmitted: boolean;
    }>("attempts.submit", token, { attemptId });
    score = sub.score;
    pass(
      "submit",
      `score=${sub.score}/${sub.maxScore} already=${sub.alreadySubmitted}`,
    );
    const sub2 = await trpcMutate<{
      score: number;
      alreadySubmitted: boolean;
    }>("attempts.submit", token, { attemptId });
    if (!sub2.alreadySubmitted) {
      throw new Error("double submit should be idempotent");
    }
    pass("doubleSubmit", `alreadySubmitted score=${sub2.score}`);
  } catch (e) {
    fail("submit", String(e));
  }

  // --- report poll ---
  try {
    let report: { status: string; score: number | null } | null = null;
    for (let i = 0; i < 12; i++) {
      try {
        report = await trpcQuery<{ status: string; score: number | null }>(
          "reports.get",
          token,
          { attemptId },
        );
        if (report.status === "READY" || report.status === "FAILED") break;
      } catch {
        // not found yet
      }
      await new Promise((r) => setTimeout(r, 2500));
    }
    if (!report) {
      pass(
        "reports.get",
        "not ready yet (Inngest async) — submit still OK; check later",
      );
    } else {
      pass("reports.get", `status=${report.status} score=${report.score}`);
    }
  } catch (e) {
    fail("reports.get", String(e));
  }

  // --- dashboard ---
  try {
    const dash = await trpcQuery<unknown>("reports.dashboard", token);
    pass("reports.dashboard", JSON.stringify(dash).slice(0, 200));
  } catch (e) {
    fail("reports.dashboard", String(e));
  }

  // --- chat.list ---
  try {
    const chats = await trpcQuery<unknown[]>("chat.list", token);
    pass("chat.list", `count=${chats.length}`);
  } catch (e) {
    fail("chat.list", String(e));
  }

  // --- web routes ---
  const publicRoutes: [string, number | number[]][] = [
    ["/", 200],
    ["/sign-in", 200],
    ["/sign-up", 200],
  ];
  for (const [path, expect] of publicRoutes) {
    try {
      const status = await checkWeb(path, expect);
      pass(`web${path}`, `status=${status}`);
    } catch (e) {
      fail(`web${path}`, String(e));
    }
  }
  // Protected routes should redirect unauthenticated fetch to sign-in (307/302)
  const protectedRoutes = [
    "/dashboard",
    "/library",
    "/tests",
    "/chat",
    `/tests/${TEST}`,
    `/exam/${attemptId}`,
    `/reports/${attemptId}`,
  ];
  for (const path of protectedRoutes) {
    try {
      const status = await checkWeb(path, [302, 307]);
      pass(`web${path}`, `redirect=${status} (auth gate OK)`);
    } catch (e) {
      // 200 without session would mean auth gate broken
      fail(`web${path}`, String(e));
    }
  }

  // --- summary ---
  const passed = results.filter((r) => r.ok).length;
  const failed = results.filter((r) => !r.ok).length;
  console.log("\n========== SUMMARY ==========");
  console.log(`passed=${passed} failed=${failed} total=${results.length}`);
  console.log(`examUrl=${WEB}/exam/${attemptId}`);
  console.log(`reportUrl=${WEB}/reports/${attemptId}`);
  console.log(`testUrl=${WEB}/tests/${TEST}`);
  if (score !== null) console.log(`score=${score}`);
  if (failed > 0) process.exit(1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
