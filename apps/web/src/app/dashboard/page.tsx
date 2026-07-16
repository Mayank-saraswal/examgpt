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
import {
  BookOpen,
  CheckCircle2,
  Circle,
  Flame,
  MessageSquare,
  Upload,
  ClipboardCheck,
} from "lucide-react";
import { useTRPC } from "@/trpc/client";
import { buttonVariants } from "@/components/ui/button";
import { EmptyState, ErrorState, LoadingState } from "@/components/async-state";
import { cn } from "@/lib/utils";

export default function DashboardPage() {
  const { isSignedIn, isLoaded } = useAuth();
  const trpc = useTRPC();
  const me = useQuery({
    ...trpc.user.me.queryOptions(),
    enabled: isLoaded && !!isSignedIn,
  });
  const dash = useQuery({
    ...trpc.reports.dashboard.queryOptions(),
    enabled: isLoaded && !!isSignedIn,
    refetchInterval: (q) => {
      const docs = q.state.data?.recentDocuments ?? [];
      const busy = docs.some(
        (d) =>
          d.ingestStatus === "PENDING" || d.ingestStatus === "PROCESSING",
      );
      return busy ? 3000 : false;
    },
  });

  if (!isLoaded) {
    return (
      <div className="mx-auto max-w-3xl px-6 py-10">
        <LoadingState label="Loading session…" />
      </div>
    );
  }

  if (!isSignedIn) {
    return (
      <div className="mx-auto max-w-3xl px-6 py-10">
        <EmptyState
          title="Sign in to continue"
          description="Use Google or email + password."
          action={
            <Link href="/sign-in" className={cn(buttonVariants())}>
              Sign in
            </Link>
          }
        />
      </div>
    );
  }

  const d = dash.data;
  const firstName = d?.firstName ?? me.data?.name?.split(" ")[0] ?? "Student";

  return (
    <div className="mx-auto flex min-h-full w-full max-w-3xl flex-col gap-6 px-6 py-10">
      <header className="flex items-start justify-between gap-3">
        <div>
          <p className="text-sm font-medium text-[var(--eg-primary)]">Dashboard</p>
          <h1 className="text-2xl font-semibold tracking-tight">
            Hi, {firstName}
          </h1>
          <div className="mt-2 flex flex-wrap items-center gap-2 text-sm text-[var(--eg-muted-fg)]">
            {d?.examType && (
              <span className="rounded-full border border-[var(--eg-border)] px-2.5 py-0.5 text-xs font-semibold">
                {d.examType}
              </span>
            )}
            {d?.daysToExam != null && d.daysToExam > 0 && (
              <span>{d.daysToExam} days to exam year target</span>
            )}
            {d != null && (
              <span className="inline-flex items-center gap-1">
                <Flame className="size-3.5 text-amber-600" aria-hidden />
                {d.studyStreak} day streak
              </span>
            )}
          </div>
        </div>
        <UserButton />
      </header>

      {dash.isLoading && <LoadingState label="Loading dashboard…" />}
      {dash.isError && (
        <ErrorState
          title="Could not load dashboard"
          description={dash.error.message}
          onRetry={() => void dash.refetch()}
        />
      )}

      {d && !d.onboarded && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 dark:border-amber-900 dark:bg-amber-950/40">
          <p className="font-medium">Finish onboarding</p>
          <p className="mt-1 text-sm text-[var(--eg-muted-fg)]">
            Pick your exam so we can personalize papers and topics.
          </p>
          <Link
            href="/onboarding"
            className={cn(buttonVariants(), "mt-3 inline-flex")}
          >
            Continue setup
          </Link>
        </div>
      )}

      {/* Instant wow / new user */}
      {d?.isNewUser && d.onboarded && (
        <>
          {d.platformPapers.length > 0 ? (
            <section className="rounded-xl border border-[var(--eg-border)] p-5">
              <h2 className="text-lg font-semibold">
                Try a real past paper now
              </h2>
              <p className="mt-1 text-sm text-[var(--eg-muted-fg)]">
                Published previous-year papers for {d.examType}. No upload wait.
              </p>
              <ul className="mt-4 space-y-2">
                {d.platformPapers.map((p) => (
                  <li key={p.id}>
                    <Link
                      href={`/tests/${p.id}`}
                      className="flex items-center justify-between rounded-lg border border-[var(--eg-border)] px-3 py-2 text-sm hover:border-[var(--eg-primary)]"
                    >
                      <span className="font-medium">{p.title}</span>
                      <span className="text-xs text-[var(--eg-muted-fg)]">
                        {p.paperYear ?? "—"} · {p._count.questions} Q
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
              <Link
                href="/tests"
                className={cn(
                  buttonVariants({ variant: "outline" }),
                  "mt-3 inline-flex",
                )}
              >
                Browse all papers
              </Link>
            </section>
          ) : (
            <section className="rounded-xl border border-[var(--eg-border)] p-5">
              <h2 className="text-lg font-semibold">Get started</h2>
              <p className="mt-1 text-sm text-[var(--eg-muted-fg)]">
                Three steps to see ExamGPT in action. Status updates from your
                real activity.
              </p>
              <ul className="mt-4 space-y-3">
                {(
                  [
                    {
                      done: d.checklist.uploadNotes,
                      label: "Upload your first notes",
                      href: "/library",
                      Icon: Upload,
                    },
                    {
                      done: d.checklist.askTutor,
                      label: "Ask the tutor a question",
                      href: "/chat",
                      Icon: MessageSquare,
                    },
                    {
                      done: d.checklist.takePaper,
                      label: "Take a past paper or mock",
                      href: "/tests",
                      Icon: ClipboardCheck,
                    },
                  ] as const
                ).map((item) => (
                  <li key={item.href}>
                    <Link
                      href={item.href}
                      className="flex items-center gap-3 rounded-lg border border-[var(--eg-border)] px-3 py-2.5 text-sm hover:bg-[var(--eg-muted)]/30"
                    >
                      {item.done ? (
                        <CheckCircle2
                          className="size-5 text-green-600"
                          aria-hidden
                        />
                      ) : (
                        <Circle
                          className="size-5 text-[var(--eg-muted-fg)]"
                          aria-hidden
                        />
                      )}
                      <item.Icon className="size-4 text-[var(--eg-primary)]" />
                      <span
                        className={cn(
                          item.done && "text-[var(--eg-muted-fg)] line-through",
                        )}
                      >
                        {item.label}
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          )}
        </>
      )}

      {/* Quick actions */}
      {d && (
        <div className="flex flex-wrap gap-2">
          <Link href="/library" className={cn(buttonVariants({ size: "sm" }), "gap-1")}>
            <Upload className="size-3.5" /> Upload notes
          </Link>
          <Link href="/chat" className={cn(buttonVariants({ size: "sm", variant: "outline" }), "gap-1")}>
            <MessageSquare className="size-3.5" /> Ask tutor
          </Link>
          <Link href="/tests" className={cn(buttonVariants({ size: "sm", variant: "outline" }), "gap-1")}>
            <ClipboardCheck className="size-3.5" /> Take test
          </Link>
          <Link href="/privacy" className={cn(buttonVariants({ size: "sm", variant: "ghost" }))}>
            Privacy
          </Link>
        </div>
      )}

      {/* Active user performance */}
      {d && !d.isNewUser && (
        <section className="rounded-xl border border-[var(--eg-border)] p-5">
          <h2 className="text-lg font-semibold">Performance</h2>
          {d.scoreTrend.length === 0 ? (
            <EmptyState
              className="mt-4 border-0 p-6"
              title="No scored attempts yet"
              description="Finish a mock to unlock your trend chart."
            />
          ) : (
            <div className="mt-4 h-48 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={d.scoreTrend}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--eg-border)" />
                  <XAxis dataKey="title" tick={{ fontSize: 10 }} interval="preserveStartEnd" />
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
          )}
          {d.weakTopics.length > 0 && (
            <div className="mt-4">
              <p className="text-xs font-medium uppercase tracking-wide text-[var(--eg-muted-fg)]">
                Weak topics
              </p>
              <ul className="mt-2 flex flex-wrap gap-2">
                {d.weakTopics.map((t) => (
                  <li key={t}>
                    <Link
                      href={`/chat?q=${encodeURIComponent(`Help me revise ${t}`)}`}
                      className="inline-block rounded-full border border-amber-200 bg-amber-50 px-3 py-1 text-xs text-amber-900 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-100"
                    >
                      {t}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          )}
          {d.recommendedNext && (
            <div className="mt-4 rounded-lg border border-[var(--eg-border)] bg-[var(--eg-muted)]/30 px-3 py-2 text-sm">
              <p className="text-xs font-medium uppercase tracking-wide text-[var(--eg-muted-fg)]">
                Recommended next
              </p>
              <p className="mt-1 font-medium">{d.recommendedNext.topic}</p>
              <p className="text-[var(--eg-muted-fg)]">
                {d.recommendedNext.action}
              </p>
            </div>
          )}
        </section>
      )}

      {/* Recent docs */}
      {d && d.recentDocuments.length > 0 && (
        <section className="rounded-xl border border-[var(--eg-border)] p-5">
          <div className="flex items-center justify-between">
            <h2 className="font-semibold">Recent documents</h2>
            <Link href="/library" className="text-xs text-[var(--eg-primary)]">
              Library
            </Link>
          </div>
          <ul className="mt-3 space-y-2">
            {d.recentDocuments.map((doc) => (
              <li key={doc.id}>
                <Link
                  href={`/library/${doc.id}`}
                  className="flex items-center justify-between gap-2 text-sm"
                >
                  <span className="inline-flex items-center gap-2 truncate">
                    <BookOpen className="size-3.5 shrink-0 text-[var(--eg-muted-fg)]" />
                    {doc.title}
                  </span>
                  <span
                    className={cn(
                      "shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase",
                      doc.ingestStatus === "READY" &&
                        "bg-green-100 text-green-800 dark:bg-green-950 dark:text-green-200",
                      doc.ingestStatus === "FAILED" &&
                        "bg-red-100 text-red-800",
                      (doc.ingestStatus === "PENDING" ||
                        doc.ingestStatus === "PROCESSING") &&
                        "bg-blue-100 text-blue-800",
                    )}
                  >
                    {doc.ingestStatus}
                    {doc.ingestStatus === "PROCESSING"
                      ? ` ${doc.ingestProgress}%`
                      : ""}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* Recent chats */}
      {d && d.recentChats.length > 0 && (
        <section className="rounded-xl border border-[var(--eg-border)] p-5">
          <div className="flex items-center justify-between">
            <h2 className="font-semibold">Recent chats</h2>
            <Link href="/chat" className="text-xs text-[var(--eg-primary)]">
              All
            </Link>
          </div>
          <ul className="mt-3 space-y-2">
            {d.recentChats.map((c) => (
              <li key={c.id}>
                <Link
                  href={`/chat/${c.id}`}
                  className="block truncate text-sm hover:text-[var(--eg-primary)]"
                >
                  {c.title || "Chat"}
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
