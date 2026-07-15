"use client";

import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { FileStack, Activity } from "lucide-react";
import { useTRPC } from "@/trpc/client";
import { buttonVariants } from "@/components/ui/button";
import { LoadingState, ErrorState } from "@/components/async-state";
import { cn } from "@/lib/utils";

export default function AdminHomePage() {
  const trpc = useTRPC();
  const papers = useQuery(trpc.admin.listPlatformPapers.queryOptions());
  const usage = useQuery(trpc.admin.usageSummary.queryOptions());

  if (papers.isLoading || usage.isLoading) {
    return <LoadingState label="Loading admin overview…" />;
  }
  if (papers.isError || usage.isError) {
    return <ErrorState title="Failed to load admin overview" />;
  }

  const list = papers.data ?? [];
  const published = list.filter((p) => p.publishedAt).length;
  const extracting = list.filter(
    (p) => p.status === "EXTRACTING" || p.status === "NEEDS_REVIEW",
  ).length;

  return (
    <div className="flex flex-col gap-6">
      <section className="grid gap-3 sm:grid-cols-3">
        <div className="rounded-xl border border-[var(--eg-border)] p-4">
          <p className="text-xs text-[var(--eg-muted-fg)]">Platform papers</p>
          <p className="mt-1 text-2xl font-semibold">{list.length}</p>
        </div>
        <div className="rounded-xl border border-[var(--eg-border)] p-4">
          <p className="text-xs text-[var(--eg-muted-fg)]">Published</p>
          <p className="mt-1 text-2xl font-semibold">{published}</p>
        </div>
        <div className="rounded-xl border border-[var(--eg-border)] p-4">
          <p className="text-xs text-[var(--eg-muted-fg)]">In pipeline</p>
          <p className="mt-1 text-2xl font-semibold">{extracting}</p>
        </div>
      </section>

      <section className="rounded-xl border border-[var(--eg-border)] p-4">
        <h2 className="font-medium">AI usage (30d)</h2>
        <p className="mt-2 text-sm text-[var(--eg-muted-fg)]">
          {usage.data?.totals.calls ?? 0} calls · $
          {(usage.data?.totals.costUsd ?? 0).toFixed(4)} · report rollup $
          {(usage.data?.reports.totalCostUsd ?? 0).toFixed(4)}
        </p>
        <div className="mt-4 flex flex-wrap gap-2">
          <Link
            href="/admin/papers"
            className={cn(buttonVariants(), "inline-flex gap-2")}
          >
            <FileStack className="size-4" aria-hidden /> Manage papers
          </Link>
          <Link
            href="/admin/usage"
            className={cn(
              buttonVariants({ variant: "outline" }),
              "inline-flex gap-2",
            )}
          >
            <Activity className="size-4" aria-hidden /> Usage detail
          </Link>
        </div>
      </section>
    </div>
  );
}
