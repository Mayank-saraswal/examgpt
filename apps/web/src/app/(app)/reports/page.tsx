"use client";

import { useAuth } from "@clerk/nextjs";
import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { FileBarChart2 } from "lucide-react";
import { useTRPC } from "@/trpc/client";
import { buttonVariants } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { EmptyState, ErrorState, LoadingState } from "@/components/async-state";
import { cn } from "@/lib/utils";

type ReportRow = {
  id: string;
  attemptId: string;
  status: string;
  score: number | null;
  maxScore: number | null;
  summary: string | null;
  createdAt: Date | string;
  attempt: {
    submittedAt: Date | string | null;
    test: { id: string; title: string; source: string };
  };
};

export default function ReportsListPage() {
  const { isSignedIn, isLoaded } = useAuth();
  const trpc = useTRPC();
  const list = useQuery({
    ...trpc.reports.listForUser.queryOptions({ limit: 30 }),
    enabled: isLoaded && !!isSignedIn,
  });

  if (!isLoaded || list.isLoading) {
    return (
      <div className="p-6">
        <LoadingState label="Loading reports…" />
      </div>
    );
  }

  if (!isSignedIn) {
    return (
      <div className="p-6">
        <EmptyState
          title="Sign in to view reports"
          action={
            <Link href="/sign-in" className={cn(buttonVariants())}>
              Sign in
            </Link>
          }
        />
      </div>
    );
  }

  if (list.isError) {
    return (
      <div className="p-6">
        <ErrorState
          title="Could not load reports"
          description={list.error.message}
          onRetry={() => void list.refetch()}
        />
      </div>
    );
  }

  const rows = (list.data ?? []) as ReportRow[];

  return (
    <div className="flex flex-1 flex-col gap-6 p-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-slate-900 dark:text-slate-50">
          Reports
        </h1>
        <p className="mt-1 text-sm text-slate-500">
          Deep analysis after each scored attempt.
        </p>
      </div>

      {rows.length === 0 ? (
        <EmptyState
          title="No reports yet"
          description="Finish a mock test to generate your first performance report."
          action={
            <Link href="/tests" className={cn(buttonVariants())}>
              Browse tests
            </Link>
          }
        />
      ) : (
        <div className="grid gap-3">
          {rows.map((r) => {
            const pct =
              r.maxScore && r.maxScore > 0
                ? Math.round(((r.score ?? 0) / r.maxScore) * 100)
                : null;
            const submitted =
              r.attempt.submittedAt != null
                ? new Date(r.attempt.submittedAt)
                : new Date(r.createdAt);
            return (
              <Link key={r.id} href={`/reports/${r.attemptId}`}>
                <Card className="transition-colors hover:border-blue-600">
                  <CardHeader className="flex-row items-start justify-between space-y-0 pb-2">
                    <div className="min-w-0">
                      <CardTitle className="truncate text-base">
                        {r.attempt.test.title}
                      </CardTitle>
                      <CardDescription>
                        {submitted.toLocaleDateString("en-IN", {
                          day: "numeric",
                          month: "short",
                          year: "numeric",
                        })}
                        {" · "}
                        {r.status}
                      </CardDescription>
                    </div>
                    <div className="flex items-center gap-2 text-sm font-semibold tabular-nums text-blue-600">
                      <FileBarChart2 className="size-4" />
                      {pct != null ? `${pct}%` : "—"}
                    </div>
                  </CardHeader>
                  {r.summary ? (
                    <CardContent>
                      <p className="line-clamp-2 text-sm text-slate-600 dark:text-slate-400">
                        {r.summary}
                      </p>
                    </CardContent>
                  ) : null}
                </Card>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
