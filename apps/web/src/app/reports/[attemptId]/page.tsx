"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useAuth } from "@clerk/nextjs";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
  Cell,
} from "recharts";
import {
  AlertCircle,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  ExternalLink,
  Loader2,
} from "lucide-react";
import { useTRPC } from "@/trpc/client";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type QRow = {
  questionIndex: number;
  status: string;
  selectedKey: string | null;
  correctKey: string | null;
  timeSpentSec: number;
  visitCount: number;
  optionChanges: number;
  confusionNote: string | null;
  isSlow: boolean;
  isConfused: boolean;
  explanation?: string | null;
  notesCitations?: {
    documentId: string;
    title: string;
    pageNumber: number;
  }[];
  webSources?: { url: string; title: string }[];
  explanationSource?: string;
  topic?: string | null;
};

type TopicRow = {
  topic: string;
  attempted: number;
  correct: number;
  accuracy: number;
  verdict: string;
  avgTimeSec: number;
};

type Filter = "all" | "wrong" | "skipped" | "slow" | "confused";

const verdictColor: Record<string, string> = {
  STRONG: "#16a34a",
  MODERATE: "#d97706",
  WEAK: "#dc2626",
};

export default function ReportPage() {
  const { attemptId } = useParams<{ attemptId: string }>();
  const { isSignedIn, isLoaded } = useAuth();
  const trpc = useTRPC();
  const qc = useQueryClient();
  const [filter, setFilter] = useState<Filter>("all");
  const [openIdx, setOpenIdx] = useState<number | null>(null);

  const reportQ = trpc.reports.get.queryOptions({ attemptId });
  const report = useQuery({
    queryKey: reportQ.queryKey,
    queryFn: reportQ.queryFn,
    enabled: isLoaded && !!isSignedIn && !!attemptId,
    refetchInterval: (q) => {
      const st = (q.state.data as { status?: string } | undefined)?.status;
      return st === "PROCESSING" || st === "PENDING" ? 3000 : false;
    },
  });

  const reanalyzeOpts = trpc.reports.reanalyze.mutationOptions();
  const reanalyze = useMutation({
    ...reanalyzeOpts,
    onSuccess: () => {
      void qc.invalidateQueries();
    },
  });

  // Detour through JSON to avoid deep JsonValue instantiation issues
  const reportData = useMemo(() => {
    if (!report.data) return null;
    return JSON.parse(JSON.stringify(report.data)) as {
      status: string;
      score: number | null;
      maxScore: number | null;
      summary: string | null;
      failureReason: string | null;
      questionAnalysis: QRow[] | null;
      topicAnalysis: TopicRow[] | null;
      cutoffData: {
        found?: boolean;
        verdict?: string | null;
        sourceUrls?: string[];
        notFoundReason?: string;
        year?: number;
      } | null;
      recommendations: {
        items?: {
          priority: number;
          topic: string;
          action: string;
          reason: string;
        }[];
        gapCloserTopics?: { topic: string; missedMarks: number }[];
        pacingNote?: string;
      } | null;
      attempt: {
        test: {
          title: string;
          paperYear: number | null;
          source: string;
        };
      };
    };
  }, [report.data]);

  const questions = useMemo(() => {
    const rows = reportData?.questionAnalysis ?? [];
    return rows.filter((r) => {
      if (filter === "all") return true;
      if (filter === "wrong") return r.status === "wrong";
      if (filter === "skipped") return r.status === "skipped";
      if (filter === "slow") return r.isSlow;
      if (filter === "confused") return r.isConfused;
      return true;
    });
  }, [reportData, filter]);

  const topics = reportData?.topicAnalysis ?? [];
  const cutoff = reportData?.cutoffData ?? null;
  const recs = reportData?.recommendations ?? null;

  if (!isLoaded) {
    return (
      <p className="p-8 text-sm text-[var(--eg-muted-fg)]">Loading…</p>
    );
  }
  if (!isSignedIn) {
    return (
      <div className="p-8">
        <Link href="/sign-in" className={cn(buttonVariants())}>
          Sign in
        </Link>
      </div>
    );
  }

  if (report.isLoading) {
    return (
      <div className="flex items-center gap-2 p-8 text-sm text-[var(--eg-muted-fg)]">
        <Loader2 className="size-4 animate-spin" /> Loading report…
      </div>
    );
  }

  if (report.isError || !reportData) {
    return (
      <div className="mx-auto max-w-lg p-8">
        <p className="text-sm text-red-600">Report not found.</p>
        <Link href="/dashboard" className={cn(buttonVariants(), "mt-4")}>
          Dashboard
        </Link>
      </div>
    );
  }

  const r = reportData;
  const pending = r.status === "PENDING" || r.status === "PROCESSING";

  return (
    <div className="mx-auto min-h-dvh w-full max-w-3xl px-4 py-8">
      <header className="mb-6 flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-sm font-medium text-[var(--eg-primary)]">
            Report
          </p>
          <h1 className="text-2xl font-semibold tracking-tight">
            {r.attempt.test.title}
          </h1>
          <p className="mt-1 text-sm text-[var(--eg-muted-fg)]">
            Status: {r.status}
            {r.attempt.test.paperYear
              ? ` · PYQ ${r.attempt.test.paperYear}`
              : ""}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link
            href="/dashboard"
            className={cn(buttonVariants({ variant: "outline", size: "sm" }))}
          >
            Dashboard
          </Link>
          <button
            type="button"
            className={cn(buttonVariants({ variant: "outline", size: "sm" }))}
            disabled={reanalyze.isPending || pending}
            onClick={() => reanalyze.mutate({ attemptId })}
          >
            Re-analyze
          </button>
        </div>
      </header>

      {pending && (
        <div className="mb-6 flex items-center gap-2 rounded-xl border border-[var(--eg-border)] bg-[var(--eg-muted)]/40 px-4 py-3 text-sm">
          <Loader2 className="size-4 animate-spin text-[var(--eg-primary)]" />
          Analysis in progress — this page refreshes automatically.
        </div>
      )}

      {r.status === "FAILED" && (
        <div className="mb-6 flex items-start gap-2 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800 dark:border-red-900 dark:bg-red-950/40 dark:text-red-200">
          <AlertCircle className="mt-0.5 size-4 shrink-0" />
          <div>
            <p className="font-medium">Analysis failed</p>
            <p className="mt-1 opacity-90">{r.failureReason ?? "Unknown error"}</p>
          </div>
        </div>
      )}

      {/* Score card */}
      <section className="mb-6 rounded-xl border border-[var(--eg-border)] p-5">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="text-sm text-[var(--eg-muted-fg)]">Score</p>
            <p className="text-4xl font-semibold tabular-nums">
              {r.score ?? "—"}
              <span className="text-lg font-normal text-[var(--eg-muted-fg)]">
                {" "}
                / {r.maxScore ?? "—"}
              </span>
            </p>
          </div>
          {r.maxScore && r.score != null && (
            <p className="text-2xl font-medium tabular-nums text-[var(--eg-primary)]">
              {Math.round((r.score / r.maxScore) * 1000) / 10}%
            </p>
          )}
        </div>
        {r.summary && (
          <p className="mt-4 text-sm leading-relaxed text-[var(--eg-fg)]">
            {r.summary}
          </p>
        )}
        {recs?.pacingNote && (
          <p className="mt-2 text-sm text-[var(--eg-muted-fg)]">
            {recs.pacingNote}
          </p>
        )}
      </section>

      {/* Topic chart */}
      {topics.length > 0 && (
        <section className="mb-6 rounded-xl border border-[var(--eg-border)] p-5">
          <h2 className="mb-4 text-lg font-semibold">Topic map</h2>
          <div className="h-56 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart
                data={topics.map((t) => ({
                  name: t.topic.slice(0, 16),
                  accuracy: Math.round(t.accuracy * 100),
                  verdict: t.verdict,
                }))}
                margin={{ top: 4, right: 8, left: 0, bottom: 24 }}
              >
                <CartesianGrid strokeDasharray="3 3" stroke="var(--eg-border)" />
                <XAxis dataKey="name" tick={{ fontSize: 11 }} />
                <YAxis domain={[0, 100]} tick={{ fontSize: 11 }} />
                <Tooltip />
                <Bar dataKey="accuracy" radius={[4, 4, 0, 0]}>
                  {topics.map((t) => (
                    <Cell
                      key={t.topic}
                      fill={verdictColor[t.verdict] ?? "#2563eb"}
                    />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
          <ul className="mt-3 flex flex-wrap gap-2">
            {topics.map((t) => (
              <li
                key={t.topic}
                className="rounded-full border border-[var(--eg-border)] px-3 py-1 text-xs"
              >
                <span
                  className="mr-1.5 inline-block size-2 rounded-full"
                  style={{ background: verdictColor[t.verdict] ?? "#64748b" }}
                />
                {t.topic}: {t.verdict} ({t.correct}/{t.attempted})
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* Cutoff */}
      <section className="mb-6 rounded-xl border border-[var(--eg-border)] p-5">
        <h2 className="mb-2 text-lg font-semibold">Cutoff comparison</h2>
        {cutoff?.found ? (
          <>
            <p className="text-sm">{cutoff.verdict ?? "Cutoff data found."}</p>
            {cutoff.year && (
              <p className="mt-1 text-xs text-[var(--eg-muted-fg)]">
                Year {cutoff.year}
              </p>
            )}
            {cutoff.sourceUrls && cutoff.sourceUrls.length > 0 && (
              <ul className="mt-2 space-y-1">
                {cutoff.sourceUrls.map((u) => (
                  <li key={u}>
                    <a
                      href={u}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex items-center gap-1 text-sm text-[var(--eg-primary)] underline-offset-2 hover:underline"
                    >
                      Source <ExternalLink className="size-3" />
                    </a>
                  </li>
                ))}
              </ul>
            )}
          </>
        ) : (
          <p className="text-sm text-[var(--eg-muted-fg)]">
            {cutoff?.notFoundReason ??
              "Cutoff not found for this paper — no numbers invented."}
          </p>
        )}
        {recs?.gapCloserTopics && recs.gapCloserTopics.length > 0 && (
          <div className="mt-3">
            <p className="text-xs font-medium uppercase tracking-wide text-[var(--eg-muted-fg)]">
              Highest marks-per-effort gaps
            </p>
            <ul className="mt-1 text-sm">
              {recs.gapCloserTopics.map((g) => (
                <li key={g.topic}>
                  {g.topic} — ~{g.missedMarks} marks
                </li>
              ))}
            </ul>
          </div>
        )}
      </section>

      {/* Recommendations */}
      {recs?.items && recs.items.length > 0 && (
        <section className="mb-6 rounded-xl border border-[var(--eg-border)] p-5">
          <h2 className="mb-3 text-lg font-semibold">Recommended next</h2>
          <ol className="space-y-2">
            {recs.items.map((item) => (
              <li
                key={`${item.priority}-${item.topic}`}
                className="rounded-lg border border-[var(--eg-border)] px-3 py-2 text-sm"
              >
                <span className="font-medium text-[var(--eg-primary)]">
                  #{item.priority}
                </span>{" "}
                <span className="font-medium">{item.topic}</span>
                <p className="mt-0.5 text-[var(--eg-muted-fg)]">{item.action}</p>
              </li>
            ))}
          </ol>
        </section>
      )}

      {/* Question list */}
      <section className="mb-10 rounded-xl border border-[var(--eg-border)] p-5">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-lg font-semibold">Question review</h2>
          <div className="flex flex-wrap gap-1">
            {(
              [
                "all",
                "wrong",
                "skipped",
                "slow",
                "confused",
              ] as Filter[]
            ).map((f) => (
              <button
                key={f}
                type="button"
                onClick={() => setFilter(f)}
                className={cn(
                  "rounded-full px-3 py-1 text-xs capitalize",
                  filter === f
                    ? "bg-[var(--eg-primary)] text-white"
                    : "border border-[var(--eg-border)] text-[var(--eg-muted-fg)]",
                )}
              >
                {f}
              </button>
            ))}
          </div>
        </div>

        {questions.length === 0 ? (
          <p className="text-sm text-[var(--eg-muted-fg)]">
            No questions match this filter.
          </p>
        ) : (
          <ul className="divide-y divide-[var(--eg-border)]">
            {questions.map((q) => {
              const open = openIdx === q.questionIndex;
              return (
                <li key={q.questionIndex} className="py-3">
                  <button
                    type="button"
                    className="flex w-full items-start justify-between gap-2 text-left"
                    onClick={() =>
                      setOpenIdx(open ? null : q.questionIndex)
                    }
                  >
                    <div>
                      <span className="font-medium">Q{q.questionIndex + 1}</span>
                      <span className="ml-2 text-xs uppercase text-[var(--eg-muted-fg)]">
                        {q.status}
                      </span>
                      {q.isSlow && (
                        <span className="ml-2 text-xs text-amber-600">slow</span>
                      )}
                      {q.isConfused && (
                        <span className="ml-2 text-xs text-amber-600">
                          confused
                        </span>
                      )}
                      <p className="mt-0.5 text-xs text-[var(--eg-muted-fg)]">
                        You: {q.selectedKey ?? "—"} · Correct:{" "}
                        {q.correctKey ?? "—"} · {q.timeSpentSec}s · visits{" "}
                        {q.visitCount}
                      </p>
                    </div>
                    {open ? (
                      <ChevronUp className="size-4 shrink-0" />
                    ) : (
                      <ChevronDown className="size-4 shrink-0" />
                    )}
                  </button>
                  {open && (
                    <div className="mt-2 rounded-lg bg-[var(--eg-muted)]/30 px-3 py-2 text-sm">
                      {q.confusionNote && (
                        <p className="mb-2 text-amber-700 dark:text-amber-400">
                          {q.confusionNote}
                        </p>
                      )}
                      {q.explanation ? (
                        <p className="leading-relaxed">{q.explanation}</p>
                      ) : (
                        <p className="text-[var(--eg-muted-fg)]">
                          No explanation generated for this question.
                        </p>
                      )}
                      {q.notesCitations && q.notesCitations.length > 0 && (
                        <div className="mt-2 flex flex-wrap gap-2">
                          {q.notesCitations.map((c) => (
                            <Link
                              key={`${c.documentId}-${c.pageNumber}`}
                              href={`/library/${c.documentId}?page=${c.pageNumber}`}
                              className="inline-flex items-center gap-1 rounded-full border border-[var(--eg-border)] bg-white px-2 py-0.5 text-xs dark:bg-zinc-900"
                            >
                              <CheckCircle2 className="size-3 text-green-600" />
                              {c.title.slice(0, 24)} p.{c.pageNumber}
                            </Link>
                          ))}
                        </div>
                      )}
                      {q.explanationSource === "web" &&
                        q.webSources &&
                        q.webSources.length > 0 && (
                          <p className="mt-2 text-xs text-[var(--eg-muted-fg)]">
                            From the web, not your notes
                          </p>
                        )}
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </div>
  );
}
