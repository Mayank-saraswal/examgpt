"use client";

import { useAuth } from "@clerk/nextjs";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useMemo } from "react";
import { Loader2 } from "lucide-react";
import { useTRPC } from "@/trpc/client";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type TestView = {
  id: string;
  title: string;
  status: string;
  source: string;
  durationMin: number;
  syllabusMatchScore: number | null;
  failureReason: string | null;
  config: {
    qualityMessage?: string | null;
    topicWarnings?: string[];
    requestedCount?: number;
    generatedCount?: number;
  } | null;
  questions: {
    id: string;
    index: number;
    section: string | null;
    text: string;
    flagged: boolean;
    answerConfidence: number | null;
  }[];
};

export default function TestDetailPage() {
  const { testId } = useParams<{ testId: string }>();
  const { isSignedIn, isLoaded } = useAuth();
  const trpc = useTRPC();
  const qc = useQueryClient();
  const router = useRouter();

  const getOpts = trpc.tests.get.queryOptions({ id: testId });
  const test = useQuery({
    queryKey: getOpts.queryKey,
    queryFn: getOpts.queryFn,
    enabled: isLoaded && !!isSignedIn && !!testId,
    refetchInterval: (q) => {
      const s = (q.state.data as { status?: string } | undefined)?.status;
      return s === "EXTRACTING" || s === "GENERATING" ? 3000 : false;
    },
  });

  const confirmOpts = trpc.tests.confirmMismatchedPaper.mutationOptions();
  const confirm = useMutation({
    mutationFn: confirmOpts.mutationFn,
    onSuccess: () => void qc.invalidateQueries({ queryKey: getOpts.queryKey }),
  });

  const finishOpts = trpc.tests.finishReview.mutationOptions();
  const finishReview = useMutation({
    mutationFn: finishOpts.mutationFn,
    onSuccess: () => void qc.invalidateQueries({ queryKey: getOpts.queryKey }),
  });

  const flagOpts = trpc.tests.reviewQuestions.mutationOptions();
  const flagQ = useMutation({
    mutationFn: flagOpts.mutationFn,
    onSuccess: () => void qc.invalidateQueries({ queryKey: getOpts.queryKey }),
  });

  const startOpts = trpc.attempts.start.mutationOptions();
  const start = useMutation({
    mutationFn: startOpts.mutationFn,
    onSuccess: (r: { attemptId: string }) => router.push(`/exam/${r.attemptId}`),
  });

  const t = useMemo(() => {
    if (!test.data) return null;
    return JSON.parse(JSON.stringify(test.data)) as TestView;
  }, [test.data]);

  return (
    <div className="mx-auto max-w-3xl px-4 py-8">
      <Link href="/tests" className={cn(buttonVariants({ variant: "ghost" }), "mb-4")}>
        Back
      </Link>
      {!t ? (
        <Loader2 className="size-6 animate-spin text-[var(--eg-primary)]" />
      ) : (
        <>
          <h1 className="text-2xl font-semibold">{t.title}</h1>
          <p className="mt-1 text-sm text-[var(--eg-muted-fg)]">
            Status: <strong>{t.status}</strong>
            {t.source === "AI_GENERATED" ? " · AI generated" : ""}
            {t.syllabusMatchScore != null &&
              ` · syllabus match ${Math.round(t.syllabusMatchScore * 100)}%`}
          </p>
          {(() => {
            const cfg = t.config as {
              qualityMessage?: string | null;
              topicWarnings?: string[];
              requestedCount?: number;
              generatedCount?: number;
            } | null;
            if (!cfg) return null;
            return (
              <div className="mt-2 space-y-1 text-sm">
                {cfg.qualityMessage && (
                  <p className="text-amber-800 dark:text-amber-200">
                    {cfg.qualityMessage}
                  </p>
                )}
                {cfg.topicWarnings?.slice(0, 5).map((w) => (
                  <p key={w} className="text-xs text-[var(--eg-muted-fg)]">
                    {w}
                  </p>
                ))}
              </div>
            );
          })()}

          {(t.status === "EXTRACTING" || t.status === "GENERATING") && (
            <div className="mt-6 rounded-xl border border-[var(--eg-border)] p-6 text-center">
              <Loader2 className="mx-auto size-8 animate-spin text-[var(--eg-primary)]" />
              <p className="mt-3 font-medium">Paper is being prepared</p>
              <p className="mt-1 text-sm text-[var(--eg-muted-fg)]">
                We will notify you when it is ready.
              </p>
            </div>
          )}

          {t.status === "NEEDS_REVIEW" && t.failureReason?.includes("syllabus") && (
            <div className="mt-6 rounded-xl border border-amber-300 bg-amber-50 p-4 dark:border-amber-800 dark:bg-amber-950">
              <p className="text-sm">{t.failureReason}</p>
              <div className="mt-3 flex flex-wrap gap-2">
                <button
                  type="button"
                  className={cn(buttonVariants({ variant: "outline" }))}
                  onClick={() => confirm.mutate({ id: testId, continueAnyway: false })}
                >
                  Upload another
                </button>
                <button
                  type="button"
                  className={cn(buttonVariants())}
                  onClick={() => confirm.mutate({ id: testId, continueAnyway: true })}
                >
                  Continue anyway
                </button>
              </div>
            </div>
          )}

          {t.status === "NEEDS_REVIEW" &&
            !t.failureReason?.includes("syllabus") &&
            t.questions.length > 0 && (
              <div className="mt-6 space-y-3">
                <p className="text-sm text-amber-800 dark:text-amber-200">
                  Spot-check flagged questions. Report bad ones (excluded from scoring).
                </p>
                {t.questions
                  .filter((q) => q.flagged || (q.answerConfidence ?? 1) < 0.8)
                  .map((q) => (
                    <div
                      key={q.id}
                      className="rounded-lg border border-[var(--eg-border)] p-3 text-sm"
                    >
                      <p className="font-medium">
                        Q{q.index}
                        {q.section ? ` · ${q.section}` : ""}
                        {q.flagged ? " · flagged" : ""}
                      </p>
                      <p className="mt-1 line-clamp-3">{q.text}</p>
                      <button
                        type="button"
                        className={cn(buttonVariants({ size: "sm", variant: "outline" }), "mt-2")}
                        onClick={() =>
                          flagQ.mutate({
                            testId,
                            flags: [{ questionIndex: q.index, flagged: !q.flagged }],
                          })
                        }
                      >
                        {q.flagged ? "Unflag" : "Report bad question"}
                      </button>
                    </div>
                  ))}
                <button
                  type="button"
                  className={cn(buttonVariants())}
                  disabled={finishReview.isPending}
                  onClick={() => finishReview.mutate({ testId })}
                >
                  Finish review · mark READY
                </button>
              </div>
            )}

          {t.status === "READY" && (
            <div className="mt-6">
              <p className="text-sm text-[var(--eg-muted-fg)]">
                {t.questions.length} questions · {t.durationMin} minutes
              </p>
              <button
                type="button"
                className={cn(buttonVariants({ size: "lg" }), "mt-4")}
                disabled={start.isPending}
                onClick={() => start.mutate({ testId })}
              >
                {start.isPending ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : (
                  "Go to instructions"
                )}
              </button>
            </div>
          )}

          {t.status === "FAILED" && (
            <p className="mt-4 text-sm text-red-600">{t.failureReason}</p>
          )}
        </>
      )}
    </div>
  );
}
