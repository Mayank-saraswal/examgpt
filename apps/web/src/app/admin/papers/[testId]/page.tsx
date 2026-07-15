"use client";

import { useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2, Check, Flag } from "lucide-react";
import { useTRPC } from "@/trpc/client";
import { buttonVariants } from "@/components/ui/button";
import {
  EmptyState,
  ErrorState,
  LoadingState,
} from "@/components/async-state";
import { cn } from "@/lib/utils";

type Q = {
  id: string;
  index: number;
  text: string;
  flagged: boolean;
  correctKey: string | null;
  topic: string | null;
  imageKeys: string[];
  options: unknown;
};

export default function AdminPaperReviewPage() {
  const { testId } = useParams<{ testId: string }>();
  const trpc = useTRPC();
  const qc = useQueryClient();
  const [localFlags, setLocalFlags] = useState<Record<number, boolean>>({});

  const paper = useQuery({
    ...trpc.admin.getPlatformPaper.queryOptions({ testId }),
    enabled: !!testId,
    refetchInterval: (q) => {
      const st = (q.state.data as { status?: string } | undefined)?.status;
      return st === "EXTRACTING" || st === "GENERATING" ? 3000 : false;
    },
  });

  const review = useMutation(
    trpc.admin.reviewPlatformQuestions.mutationOptions(),
  );
  const finish = useMutation({
    ...trpc.admin.finishPlatformReview.mutationOptions(),
    onSuccess: () => {
      void qc.invalidateQueries(
        trpc.admin.getPlatformPaper.queryFilter({ testId }),
      );
      void qc.invalidateQueries(trpc.admin.listPlatformPapers.queryFilter());
    },
  });
  const retry = useMutation({
    ...trpc.admin.retryPlatformExtraction.mutationOptions(),
    onSuccess: () => {
      void qc.invalidateQueries(
        trpc.admin.getPlatformPaper.queryFilter({ testId }),
      );
    },
  });
  const publish = useMutation({
    ...trpc.admin.setPublished.mutationOptions(),
    onSuccess: () => {
      void qc.invalidateQueries(
        trpc.admin.getPlatformPaper.queryFilter({ testId }),
      );
      void qc.invalidateQueries(trpc.admin.listPlatformPapers.queryFilter());
    },
  });

  if (paper.isLoading) return <LoadingState label="Loading paper…" />;
  if (paper.isError || !paper.data) {
    return <ErrorState title="Platform paper not found" />;
  }

  const t = paper.data;
  const questions = (t.questions ?? []) as Q[];

  async function saveFlags() {
    const flags = questions.map((q) => ({
      questionIndex: q.index,
      flagged: localFlags[q.index] ?? q.flagged,
    }));
    await review.mutateAsync({ testId, flags });
    void qc.invalidateQueries(
      trpc.admin.getPlatformPaper.queryFilter({ testId }),
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <Link
            href="/admin/papers"
            className="text-sm text-[var(--eg-muted-fg)] hover:underline"
          >
            Back to papers
          </Link>
          <h2 className="text-xl font-semibold">{t.title}</h2>
          <p className="text-sm text-[var(--eg-muted-fg)]">
            {t.examType} · {t.paperYear} · {t.status}
            {t.publishedAt ? " · published" : ""}
          </p>
          {t.failureReason && (
            <p className="mt-1 text-sm text-amber-700 dark:text-amber-400">
              {t.failureReason}
            </p>
          )}
        </div>
        <div className="flex flex-wrap gap-2">
          {(t.status === "FAILED" || t.status === "NEEDS_REVIEW") && (
            <button
              type="button"
              className={cn(buttonVariants({ variant: "outline" }))}
              disabled={retry.isPending}
              onClick={() => retry.mutate({ testId })}
            >
              {retry.isPending ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                "Retry extract"
              )}
            </button>
          )}
          <button
            type="button"
            className={cn(buttonVariants({ variant: "outline" }))}
            disabled={review.isPending}
            onClick={() => void saveFlags()}
          >
            Save flags
          </button>
          <button
            type="button"
            className={cn(buttonVariants({ variant: "outline" }))}
            disabled={finish.isPending || questions.length === 0}
            onClick={() => finish.mutate({ testId })}
          >
            <Check className="mr-1 size-4" /> Mark READY
          </button>
          <button
            type="button"
            className={cn(buttonVariants())}
            disabled={
              publish.isPending || (t.status !== "READY" && !t.publishedAt)
            }
            onClick={() =>
              publish.mutate({
                testId,
                published: !t.publishedAt,
              })
            }
          >
            {t.publishedAt ? "Unpublish" : "Publish"}
          </button>
        </div>
      </div>

      {t.status === "EXTRACTING" && (
        <LoadingState label="Extracting questions…" />
      )}

      {questions.length === 0 && t.status !== "EXTRACTING" && (
        <EmptyState
          title="No questions yet"
          description="Wait for extraction or retry if it failed."
        />
      )}

      <ul className="divide-y divide-[var(--eg-border)] rounded-xl border border-[var(--eg-border)]">
        {questions.map((q) => {
          const flagged = localFlags[q.index] ?? q.flagged;
          return (
            <li key={q.id} className="px-4 py-3">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0 flex-1">
                  <p className="text-xs text-[var(--eg-muted-fg)]">
                    Q{q.index}
                    {q.topic ? ` · ${q.topic}` : ""}
                    {q.correctKey ? ` · ans ${q.correctKey}` : ""}
                    {q.imageKeys?.length ? " · has figure" : ""}
                  </p>
                  <p className="mt-1 text-sm">{q.text.slice(0, 400)}</p>
                </div>
                <button
                  type="button"
                  className={cn(
                    "inline-flex items-center gap-1 rounded-full border px-2 py-1 text-xs",
                    flagged
                      ? "border-amber-500 text-amber-700"
                      : "border-[var(--eg-border)] text-[var(--eg-muted-fg)]",
                  )}
                  onClick={() =>
                    setLocalFlags((prev) => ({
                      ...prev,
                      [q.index]: !flagged,
                    }))
                  }
                >
                  <Flag className="size-3" />
                  {flagged ? "Flagged" : "Flag"}
                </button>
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
