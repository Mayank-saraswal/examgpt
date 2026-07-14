"use client";

import { useAuth, UserButton } from "@clerk/nextjs";
import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { useTRPC } from "@/trpc/client";
import { buttonVariants } from "@/components/ui/button";
import { HealthStatus } from "@/components/health-status";
import { cn } from "@/lib/utils";

export default function DashboardPage() {
  const { isSignedIn, isLoaded } = useAuth();
  const trpc = useTRPC();
  const me = useQuery({
    ...trpc.user.me.queryOptions(),
    enabled: isLoaded && !!isSignedIn,
  });
  const status = useQuery({
    ...trpc.onboarding.status.queryOptions(),
    enabled: isLoaded && !!isSignedIn,
  });
  const dashOpts = trpc.reports.dashboard.queryOptions();
  const dash = useQuery({
    queryKey: dashOpts.queryKey,
    queryFn: dashOpts.queryFn,
    enabled: isLoaded && !!isSignedIn,
  });

  return (
    <div className="mx-auto flex min-h-full w-full max-w-2xl flex-col gap-6 px-6 py-10">
      <header className="flex items-center justify-between">
        <div>
          <p className="text-sm font-medium text-[var(--eg-primary)]">ExamGPT</p>
          <h1 className="text-2xl font-semibold tracking-tight">Dashboard</h1>
        </div>
        {isSignedIn ? (
          <UserButton />
        ) : (
          <Link
            href="/sign-in"
            className={cn(buttonVariants({ variant: "default" }))}
          >
            Sign in
          </Link>
        )}
      </header>

      {!isLoaded && (
        <p className="text-sm text-[var(--eg-muted-fg)]">Loading…</p>
      )}

      {isLoaded && !isSignedIn && (
        <p className="text-sm text-[var(--eg-muted-fg)]">
          Sign in with Google or email + password to continue.
        </p>
      )}

      {isSignedIn && (
        <>
          {me.isLoading ? (
            <p className="text-sm text-[var(--eg-muted-fg)]">Loading profile…</p>
          ) : (
            <div className="rounded-xl border border-[var(--eg-border)] p-5">
              <p className="font-medium">{me.data?.name ?? "Student"}</p>
              <p className="mt-1 text-sm text-[var(--eg-muted-fg)]">
                {me.data?.email ?? me.data?.phone ?? me.data?.id}
              </p>
              <p className="mt-3 text-sm">
                Onboarded:{" "}
                <span className="font-medium">
                  {status.data?.onboarded ? "yes" : "no"}
                </span>
              </p>
              {status.data?.exam && (
                <p className="mt-1 text-sm">
                  Exam:{" "}
                  <span className="font-medium">
                    {status.data.exam.type}
                    {status.data.exam.customName
                      ? ` (${status.data.exam.customName})`
                      : ""}
                  </span>
                  {" · "}
                  syllabus {status.data.exam.syllabusStatus}
                </p>
              )}
              {!status.data?.onboarded && (
                <Link
                  href="/onboarding"
                  className={cn(buttonVariants({ variant: "default" }), "mt-4")}
                >
                  Complete onboarding
                </Link>
              )}
              <div className="mt-4 flex flex-wrap gap-2">
                <Link
                  href="/chat"
                  className={cn(buttonVariants({ variant: "default" }))}
                >
                  Chat tutor
                </Link>
                <Link
                  href="/tests"
                  className={cn(buttonVariants({ variant: "default" }))}
                >
                  Tests
                </Link>
                <Link
                  href="/library"
                  className={cn(buttonVariants({ variant: "outline" }))}
                >
                  Library
                </Link>
                {dash.data?.latestAttemptId && (
                  <Link
                    href={`/reports/${dash.data.latestAttemptId}`}
                    className={cn(buttonVariants({ variant: "outline" }))}
                  >
                    Latest report
                  </Link>
                )}
              </div>
            </div>
          )}

          {dash.data && (
            <section className="rounded-xl border border-[var(--eg-border)] p-5">
              <h2 className="text-lg font-semibold">Performance</h2>
              {dash.data.scoreTrend.length === 0 ? (
                <p className="mt-2 text-sm text-[var(--eg-muted-fg)]">
                  Complete a mock test to see your score trend and weak topics.
                </p>
              ) : (
                <>
                  <div className="mt-4 h-48 w-full">
                    <ResponsiveContainer width="100%" height="100%">
                      <LineChart data={dash.data.scoreTrend}>
                        <CartesianGrid
                          strokeDasharray="3 3"
                          stroke="var(--eg-border)"
                        />
                        <XAxis
                          dataKey="title"
                          tick={{ fontSize: 10 }}
                          interval="preserveStartEnd"
                        />
                        <YAxis domain={[0, 100]} tick={{ fontSize: 11 }} />
                        <Tooltip />
                        <Line
                          type="monotone"
                          dataKey="pct"
                          name="% score"
                          stroke="#2563eb"
                          strokeWidth={2}
                          dot={{ r: 3 }}
                        />
                      </LineChart>
                    </ResponsiveContainer>
                  </div>
                  {dash.data.weakTopics.length > 0 && (
                    <div className="mt-4">
                      <p className="text-xs font-medium uppercase tracking-wide text-[var(--eg-muted-fg)]">
                        Current weak topics
                      </p>
                      <ul className="mt-2 flex flex-wrap gap-2">
                        {dash.data.weakTopics.map((t) => (
                          <li
                            key={t}
                            className="rounded-full border border-amber-200 bg-amber-50 px-3 py-1 text-xs text-amber-900 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-100"
                          >
                            {t}
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                  {dash.data.recommendedNext && (
                    <div className="mt-4 rounded-lg border border-[var(--eg-border)] bg-[var(--eg-muted)]/30 px-3 py-2 text-sm">
                      <p className="text-xs font-medium uppercase tracking-wide text-[var(--eg-muted-fg)]">
                        Recommended next
                      </p>
                      <p className="mt-1 font-medium">
                        {dash.data.recommendedNext.topic}
                      </p>
                      <p className="text-[var(--eg-muted-fg)]">
                        {dash.data.recommendedNext.action}
                      </p>
                    </div>
                  )}
                </>
              )}
            </section>
          )}

          <HealthStatus />
        </>
      )}
    </div>
  );
}
