/**
 * Adaptive topic quotas for AI paper generation (Phase 6).
 * Auto mode: 50% weak / 30% moderate / 20% strong (TASKS.md).
 */

export type TopicVerdictLite = "STRONG" | "MODERATE" | "WEAK";

export type TopicVerdictRow = {
  topic: string;
  verdict: TopicVerdictLite;
};

export type TopicQuota = {
  topic: string;
  count: number;
  bucket: TopicVerdictLite | "MANUAL" | "DEFAULT";
};

const AUTO_WEIGHTS = {
  WEAK: 0.5,
  MODERATE: 0.3,
  STRONG: 0.2,
} as const;

/**
 * Allocate integer question counts that sum to `questionCount`.
 * Largest-remainder method so totals always match.
 */
export function allocateCounts(
  weights: { key: string; weight: number }[],
  total: number,
): Map<string, number> {
  if (total <= 0 || weights.length === 0) return new Map();
  const sumW = weights.reduce((s, w) => s + w.weight, 0) || 1;
  const raw = weights.map((w) => ({
    key: w.key,
    exact: (w.weight / sumW) * total,
  }));
  const floors = raw.map((r) => ({
    key: r.key,
    n: Math.floor(r.exact),
    frac: r.exact - Math.floor(r.exact),
  }));
  let used = floors.reduce((s, f) => s + f.n, 0);
  const byFrac = [...floors].sort((a, b) => b.frac - a.frac);
  let i = 0;
  while (used < total && byFrac.length > 0) {
    byFrac[i % byFrac.length]!.n += 1;
    used += 1;
    i += 1;
  }
  return new Map(floors.map((f) => [f.key, f.n]));
}

/**
 * Plan per-topic question counts.
 * - auto: weight by report verdicts (weak over-represented)
 * - manual: even split across selectedTopics
 * - fallback: DEFAULT buckets from syllabus topic list
 */
export function planTopicQuotas(opts: {
  questionCount: number;
  mode: "auto" | "manual";
  selectedTopics?: string[];
  topicVerdicts?: TopicVerdictRow[];
  syllabusTopics?: string[];
}): TopicQuota[] {
  const n = Math.max(1, Math.min(200, opts.questionCount));

  if (opts.mode === "manual" && opts.selectedTopics && opts.selectedTopics.length > 0) {
    const topics = [...new Set(opts.selectedTopics.map((t) => t.trim()).filter(Boolean))];
    const counts = allocateCounts(
      topics.map((t) => ({ key: t, weight: 1 })),
      n,
    );
    return topics
      .map((topic) => ({
        topic,
        count: counts.get(topic) ?? 0,
        bucket: "MANUAL" as const,
      }))
      .filter((q) => q.count > 0);
  }

  const verdicts = opts.topicVerdicts ?? [];
  const byBucket: Record<TopicVerdictLite, string[]> = {
    WEAK: [],
    MODERATE: [],
    STRONG: [],
  };
  for (const v of verdicts) {
    const t = v.topic.trim();
    if (!t) continue;
    if (!byBucket[v.verdict].includes(t)) byBucket[v.verdict].push(t);
  }

  // Fill empty buckets from syllabus so auto still works with no reports
  const syllabus = opts.syllabusTopics ?? [];
  if (byBucket.WEAK.length + byBucket.MODERATE.length + byBucket.STRONG.length === 0) {
    // No verdicts — distribute across syllabus evenly
    const topics =
      syllabus.length > 0
        ? syllabus
        : ["General Physics", "General Chemistry", "General Biology"];
    const counts = allocateCounts(
      topics.map((t) => ({ key: t, weight: 1 })),
      n,
    );
    return topics
      .map((topic) => ({
        topic,
        count: counts.get(topic) ?? 0,
        bucket: "DEFAULT" as const,
      }))
      .filter((q) => q.count > 0);
  }

  // Ensure each used bucket has at least one topic (fall back to syllabus)
  for (const b of ["WEAK", "MODERATE", "STRONG"] as const) {
    if (byBucket[b].length === 0 && syllabus.length > 0) {
      byBucket[b].push(syllabus[Math.floor(Math.random() * syllabus.length)]!);
    }
  }

  const bucketTotals = allocateCounts(
    (["WEAK", "MODERATE", "STRONG"] as const)
      .filter((b) => byBucket[b].length > 0)
      .map((b) => ({ key: b, weight: AUTO_WEIGHTS[b] })),
    n,
  );

  const out: TopicQuota[] = [];
  for (const b of ["WEAK", "MODERATE", "STRONG"] as const) {
    const bucketN = bucketTotals.get(b) ?? 0;
    if (bucketN <= 0 || byBucket[b].length === 0) continue;
    const topicCounts = allocateCounts(
      byBucket[b].map((t) => ({ key: t, weight: 1 })),
      bucketN,
    );
    for (const [topic, count] of topicCounts) {
      if (count > 0) out.push({ topic, count, bucket: b });
    }
  }

  // Merge same topic across buckets
  const merged = new Map<string, TopicQuota>();
  for (const q of out) {
    const prev = merged.get(q.topic);
    if (prev) {
      prev.count += q.count;
      // Prefer WEAK label if mixed
      if (q.bucket === "WEAK") prev.bucket = "WEAK";
    } else {
      merged.set(q.topic, { ...q });
    }
  }
  return [...merged.values()].filter((q) => q.count > 0);
}

/** Flatten bundled syllabus JSON → topic name list */
export function flattenSyllabusTopics(syllabus: unknown): string[] {
  if (!syllabus || typeof syllabus !== "object") return [];
  const root = syllabus as {
    subjects?: { name?: string; units?: { name?: string; topics?: string[] }[] }[];
    topics?: string[];
  };
  if (Array.isArray(root.topics)) {
    return root.topics.filter((t) => typeof t === "string");
  }
  const out: string[] = [];
  for (const s of root.subjects ?? []) {
    for (const u of s.units ?? []) {
      for (const t of u.topics ?? []) {
        if (typeof t === "string" && t.trim()) out.push(t.trim());
      }
    }
  }
  return [...new Set(out)];
}

/** Share of questions that land on weak topics (for acceptance checks) */
export function weakTopicShare(plan: TopicQuota[]): number {
  const total = plan.reduce((s, p) => s + p.count, 0);
  if (total === 0) return 0;
  const weak = plan
    .filter((p) => p.bucket === "WEAK")
    .reduce((s, p) => s + p.count, 0);
  return weak / total;
}
