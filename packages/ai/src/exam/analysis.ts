/**
 * Pure analysis helpers for attempt/analyze (Phase 5).
 * No AI calls — deterministic from responses + question metadata.
 */

export type TopicVerdict = "STRONG" | "MODERATE" | "WEAK";

export type QuestionAnalysisInput = {
  questionIndex: number;
  topic: string | null;
  subtopic: string | null;
  section: string | null;
  correctKey: string | null;
  selectedKey: string | null;
  isCorrect: boolean | null;
  timeSpentSec: number;
  visitCount: number;
  optionChanges: number;
  paletteState: string;
  /** Ordered option keys selected (from CHANGE/SELECT events) for trail text */
  optionTrail?: string[];
  /** Cropped figure storage keys from extraction */
  imageKeys?: string[];
};

export type TopicAnalysisRow = {
  topic: string;
  attempted: number;
  correct: number;
  wrong: number;
  skipped: number;
  avgTimeSec: number;
  accuracy: number;
  verdict: TopicVerdict;
};

export type TimeAnalysis = {
  avgTimeSec: number;
  medianTimeSec: number;
  slowThresholdSec: number;
  totalTimeSec: number;
  slowButCorrect: number[];
  rushedWrong: number[];
  highVisit: number[];
};

export type QuestionAnalysisRow = {
  questionIndex: number;
  topic: string | null;
  subtopic: string | null;
  section: string | null;
  status: "correct" | "wrong" | "skipped" | "ungraded";
  selectedKey: string | null;
  correctKey: string | null;
  timeSpentSec: number;
  visitCount: number;
  optionChanges: number;
  optionTrail: string[];
  confusionNote: string | null;
  isSlow: boolean;
  isConfused: boolean;
  marksAwarded?: number | null;
  /** Filled later by AI / RAG step */
  explanation?: string | null;
  notesCitations?: {
    documentId: string;
    title: string;
    pageNumber: number;
  }[];
  webSources?: { url: string; title: string }[];
  explanationSource?: "notes" | "web" | "model" | "none";
  /** Cropped figure storage keys for exam/report rendering */
  imageKeys?: string[];
};

function median(nums: number[]): number {
  if (nums.length === 0) return 0;
  const s = [...nums].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 === 0 ? (s[mid - 1]! + s[mid]!) / 2 : s[mid]!;
}

/**
 * Build human-readable confusion trail from ordered option keys.
 * e.g. ["B","C","B"] → "you switched B→C→B — confusion between B and C"
 */
export function formatOptionChangeTrail(trail: string[]): string | null {
  const cleaned = trail.filter(Boolean);
  if (cleaned.length < 2) return null;
  const path = cleaned.join("→");
  const unique = [...new Set(cleaned)];
  if (unique.length >= 2) {
    return `you switched ${path} — confusion between ${unique.join(" and ")}`;
  }
  return `you switched ${path}`;
}

export function classifyQuestionStatus(
  isCorrect: boolean | null,
  selectedKey: string | null,
): QuestionAnalysisRow["status"] {
  if (selectedKey == null || selectedKey === "") return "skipped";
  if (isCorrect === true) return "correct";
  if (isCorrect === false) return "wrong";
  return "ungraded";
}

/**
 * Per-topic accuracy → STRONG / MODERATE / WEAK.
 * STRONG: accuracy ≥ 0.75 and ≥2 attempted
 * WEAK: accuracy < 0.45 or (attempted≥1 and correct===0)
 * else MODERATE
 */
export function verdictForTopic(
  correct: number,
  attempted: number,
): TopicVerdict {
  if (attempted === 0) return "MODERATE";
  const acc = correct / attempted;
  if (attempted >= 2 && acc >= 0.75) return "STRONG";
  if (acc < 0.45 || correct === 0) return "WEAK";
  return "MODERATE";
}

export function buildTopicAnalysis(
  rows: QuestionAnalysisInput[],
): TopicAnalysisRow[] {
  const map = new Map<
    string,
    { attempted: number; correct: number; wrong: number; skipped: number; time: number }
  >();

  for (const r of rows) {
    const topic = (r.topic?.trim() || r.section?.trim() || "Untagged").slice(
      0,
      120,
    );
    let bucket = map.get(topic);
    if (!bucket) {
      bucket = { attempted: 0, correct: 0, wrong: 0, skipped: 0, time: 0 };
      map.set(topic, bucket);
    }
    bucket.time += r.timeSpentSec;
    const status = classifyQuestionStatus(r.isCorrect, r.selectedKey);
    if (status === "skipped" || status === "ungraded") {
      bucket.skipped += 1;
    } else {
      bucket.attempted += 1;
      if (status === "correct") bucket.correct += 1;
      else bucket.wrong += 1;
    }
  }

  return [...map.entries()]
    .map(([topic, b]) => {
      const accuracy = b.attempted > 0 ? b.correct / b.attempted : 0;
      const n = b.attempted + b.skipped;
      return {
        topic,
        attempted: b.attempted,
        correct: b.correct,
        wrong: b.wrong,
        skipped: b.skipped,
        avgTimeSec: n > 0 ? Math.round(b.time / n) : 0,
        accuracy,
        verdict: verdictForTopic(b.correct, b.attempted),
      };
    })
    .sort((a, b) => a.topic.localeCompare(b.topic));
}

export function buildTimeAnalysis(
  rows: QuestionAnalysisInput[],
): TimeAnalysis {
  const times = rows.map((r) => r.timeSpentSec).filter((t) => t > 0);
  const avg =
    times.length > 0
      ? times.reduce((a, b) => a + b, 0) / times.length
      : 0;
  const med = median(times);
  const slowThresholdSec = Math.max(med * 1.5, avg * 1.4, 60);

  const slowButCorrect: number[] = [];
  const rushedWrong: number[] = [];
  const highVisit: number[] = [];
  const rushThreshold = Math.max(med * 0.4, 15);

  for (const r of rows) {
    if (r.isCorrect === true && r.timeSpentSec >= slowThresholdSec) {
      slowButCorrect.push(r.questionIndex);
    }
    if (
      r.isCorrect === false &&
      r.selectedKey &&
      r.timeSpentSec > 0 &&
      r.timeSpentSec <= rushThreshold
    ) {
      rushedWrong.push(r.questionIndex);
    }
    if (r.visitCount >= 3) {
      highVisit.push(r.questionIndex);
    }
  }

  return {
    avgTimeSec: Math.round(avg),
    medianTimeSec: Math.round(med),
    slowThresholdSec: Math.round(slowThresholdSec),
    totalTimeSec: times.reduce((a, b) => a + b, 0),
    slowButCorrect,
    rushedWrong,
    highVisit,
  };
}

export function buildQuestionAnalysisRows(
  rows: QuestionAnalysisInput[],
  time: TimeAnalysis,
): QuestionAnalysisRow[] {
  return rows.map((r) => {
    const status = classifyQuestionStatus(r.isCorrect, r.selectedKey);
    const trail = r.optionTrail ?? [];
    const confusionNote = formatOptionChangeTrail(trail);
    const isConfused = r.optionChanges >= 2 || trail.length >= 3;
    const isSlow =
      status === "correct" &&
      r.timeSpentSec >= time.slowThresholdSec;

    return {
      questionIndex: r.questionIndex,
      topic: r.topic,
      subtopic: r.subtopic,
      section: r.section,
      status,
      selectedKey: r.selectedKey,
      correctKey: r.correctKey,
      timeSpentSec: r.timeSpentSec,
      visitCount: r.visitCount,
      optionChanges: r.optionChanges,
      optionTrail: trail,
      confusionNote,
      isSlow,
      isConfused,
      explanation: null,
      notesCitations: [],
      webSources: [],
      explanationSource: "none",
      imageKeys: r.imageKeys ?? [],
    };
  });
}

/**
 * Reconstruct ordered option trail from attempt events for one question.
 */
export function optionTrailFromEvents(
  events: { questionIndex: number; type: string; optionKey?: string | null; clientTs: Date | string | number }[],
  questionIndex: number,
): string[] {
  const sorted = events
    .filter((e) => e.questionIndex === questionIndex)
    .sort(
      (a, b) =>
        new Date(a.clientTs).getTime() - new Date(b.clientTs).getTime(),
    );
  const trail: string[] = [];
  for (const e of sorted) {
    if (
      (e.type === "SELECT" || e.type === "CHANGE") &&
      e.optionKey &&
      (trail.length === 0 || trail[trail.length - 1] !== e.optionKey)
    ) {
      trail.push(e.optionKey);
    }
    if (e.type === "CLEAR") {
      // keep trail history but mark discontinuity with empty optional — skip
    }
  }
  return trail;
}

/**
 * Weak topics ordered by marks recoverable (wrong * marks-per-q heuristic).
 */
export function rankWeakTopicsForGap(
  topics: TopicAnalysisRow[],
  marksPerCorrect = 4,
): { topic: string; missedMarks: number; verdict: TopicVerdict }[] {
  return topics
    .filter((t) => t.verdict === "WEAK" || t.wrong > 0)
    .map((t) => ({
      topic: t.topic,
      missedMarks: t.wrong * marksPerCorrect,
      verdict: t.verdict,
    }))
    .sort((a, b) => b.missedMarks - a.missedMarks);
}
