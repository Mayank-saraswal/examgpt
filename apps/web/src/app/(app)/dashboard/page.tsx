"use client";

import { useAuth } from "@clerk/nextjs";
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
  CalendarDays,
  CheckCircle2,
  Circle,
  ClipboardCheck,
  Flame,
  MessageSquare,
  Percent,
  Upload,
} from "lucide-react";
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

function formatShortDate(iso: string | Date) {
  const d = typeof iso === "string" ? new Date(iso) : iso;
  return d.toLocaleDateString("en-IN", {
    day: "numeric",
    month: "short",
  });
}

export default function DashboardPage() {
  const { isSignedIn, isLoaded } = useAuth();
  const trpc = useTRPC();
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
      <div className="p-6">
        <LoadingState label="Loading session…" />
      </div>
    );
  }

  if (!isSignedIn) {
    return (
      <div className="p-6">
        <EmptyState
          title="Sign in to continue"
          action={
            <Link href="/sign-in" className={cn(buttonVariants())}>
              Sign in
            </Link>
          }
        />
      </div>
    );
  }

  if (dash.isLoading) {
    return (
      <div className="p-6">
        <LoadingState label="Loading dashboard…" />
      </div>
    );
  }

  if (dash.isError || !dash.data) {
    return (
      <div className="p-6">
        <ErrorState
          title="Could not load dashboard"
          description={dash.error?.message}
          onRetry={() => void dash.refetch()}
        />
      </div>
    );
  }

  const d = dash.data;
  const firstName = d.firstName ?? "Student";
  const testsTaken = d.scoreTrend.length;
  const avgScore =
    testsTaken > 0
      ? Math.round(
          d.scoreTrend.reduce((s, r) => s + r.pct, 0) / testsTaken,
        )
      : null;

  const chartData = d.scoreTrend.map((r) => ({
    ...r,
    label: `${formatShortDate(r.at)} · ${(r.title ?? "").slice(0, 16)}`,
    pct: Math.max(0, Math.min(100, r.pct)),
  }));

  const yMax = Math.max(
    100,
    ...chartData.map((r) => r.pct),
    1,
  );

  return (
    <div className="flex flex-1 flex-col gap-6 p-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-slate-900 dark:text-slate-50">
          Hi, {firstName}
        </h1>
        <p className="mt-1 text-sm text-slate-500">
          {d.examType ?? "Set your exam in onboarding"}
          {d.daysToExam != null && d.daysToExam > 0
            ? ` · ${d.daysToExam} days to target year`
            : ""}
        </p>
      </div>

      {!d.onboarded && (
        <Card className="border-amber-200 bg-amber-50 dark:border-amber-900 dark:bg-amber-950/30">
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Finish onboarding</CardTitle>
            <CardDescription>
              Pick your exam so we can personalize papers and topics.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Link href="/onboarding" className={cn(buttonVariants())}>
              Continue setup
            </Link>
          </CardContent>
        </Card>
      )}

      {/* Stat cards */}
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          title="Study streak"
          value={`${d.studyStreak}`}
          unit="days"
          icon={Flame}
          iconClass="text-amber-600"
        />
        <StatCard
          title="Tests taken"
          value={`${testsTaken}`}
          unit="scored"
          icon={ClipboardCheck}
        />
        <StatCard
          title="Average score"
          value={avgScore != null ? `${avgScore}` : "—"}
          unit={avgScore != null ? "%" : ""}
          icon={Percent}
        />
        <StatCard
          title="Days to exam"
          value={
            d.daysToExam != null && d.daysToExam > 0
              ? `${d.daysToExam}`
              : "—"
          }
          unit={d.targetYear ? `target ${d.targetYear}` : ""}
          icon={CalendarDays}
        />
      </div>

      {/* Instant wow / new user */}
      {d.isNewUser && d.onboarded && (
        <div className="grid gap-4 lg:grid-cols-2">
          {d.platformPapers.length > 0 ? (
            <Card className="lg:col-span-2">
              <CardHeader>
                <CardTitle>Try a real past paper now</CardTitle>
                <CardDescription>
                  Published previous-year papers for {d.examType}. No upload
                  wait.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-2">
                {d.platformPapers.map((p) => (
                  <Link
                    key={p.id}
                    href={`/tests/${p.id}`}
                    className="flex items-center justify-between rounded-lg border border-slate-200 px-3 py-2.5 text-sm hover:border-blue-600 dark:border-slate-800"
                  >
                    <span className="font-medium">{p.title}</span>
                    <span className="text-xs text-slate-500">
                      {p.paperYear ?? "—"} · {p._count.questions} Q
                    </span>
                  </Link>
                ))}
              </CardContent>
            </Card>
          ) : (
            <Card className="lg:col-span-2">
              <CardHeader>
                <CardTitle>Get started</CardTitle>
                <CardDescription>
                  Three steps driven by your real activity.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-2">
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
                  <Link
                    key={item.href}
                    href={item.href}
                    className="flex items-center gap-3 rounded-lg border border-slate-200 px-3 py-2.5 text-sm dark:border-slate-800"
                  >
                    {item.done ? (
                      <CheckCircle2 className="size-5 text-green-600" />
                    ) : (
                      <Circle className="size-5 text-slate-400" />
                    )}
                    <item.Icon className="size-4 text-blue-600" />
                    <span
                      className={cn(
                        item.done && "text-slate-500 line-through",
                      )}
                    >
                      {item.label}
                    </span>
                  </Link>
                ))}
              </CardContent>
            </Card>
          )}
        </div>
      )}

      {/* Performance + recommended */}
      {!d.isNewUser && (
        <div className="grid gap-4 lg:grid-cols-3">
          <Card className="lg:col-span-2">
            <CardHeader>
              <CardTitle>Performance</CardTitle>
              <CardDescription>
                Score % by attempt (y-axis 0–100, never below zero)
              </CardDescription>
            </CardHeader>
            <CardContent>
              {chartData.length === 0 ? (
                <EmptyState
                  className="border-0 py-8"
                  title="No scored attempts yet"
                  description="Finish a mock to unlock your trend."
                />
              ) : (
                <div className="h-64 w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart
                      data={chartData}
                      margin={{ top: 8, right: 8, left: 0, bottom: 8 }}
                    >
                      <CartesianGrid
                        strokeDasharray="3 3"
                        stroke="var(--eg-border)"
                        vertical={false}
                      />
                      <XAxis
                        dataKey="label"
                        tick={{ fontSize: 10, fill: "var(--eg-muted-fg)" }}
                        interval="preserveStartEnd"
                        tickLine={false}
                        axisLine={{ stroke: "var(--eg-border)" }}
                      />
                      <YAxis
                        domain={[0, Math.min(100, Math.ceil(yMax / 10) * 10) || 100]}
                        tick={{ fontSize: 11, fill: "var(--eg-muted-fg)" }}
                        tickLine={false}
                        axisLine={false}
                        width={36}
                      />
                      <Tooltip
                        contentStyle={{
                          background: "var(--eg-bg)",
                          border: "1px solid var(--eg-border)",
                          borderRadius: 8,
                          fontSize: 12,
                        }}
                        formatter={(value) => [
                          `${Number(value ?? 0)}%`,
                          "Score",
                        ]}
                      />
                      <Line
                        type="monotone"
                        dataKey="pct"
                        name="Score %"
                        stroke="#2563eb"
                        strokeWidth={2}
                        dot={{ r: 3, fill: "#2563eb" }}
                        activeDot={{ r: 5 }}
                      />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              )}
            </CardContent>
          </Card>

          <div className="flex flex-col gap-4">
            {d.recommendedNext && (
              <Card>
                <CardHeader>
                  <CardTitle className="text-base">Recommended next</CardTitle>
                  <CardDescription>{d.recommendedNext.topic}</CardDescription>
                </CardHeader>
                <CardContent>
                  <p className="text-sm text-slate-600 dark:text-slate-400">
                    {d.recommendedNext.action}
                  </p>
                  <Link
                    href={`/chat?q=${encodeURIComponent(
                      `Help me with ${d.recommendedNext.topic}`,
                    )}`}
                    className={cn(buttonVariants({ size: "sm" }), "mt-4")}
                  >
                    Practice in chat
                  </Link>
                </CardContent>
              </Card>
            )}
            {d.weakTopics.length > 0 && (
              <Card>
                <CardHeader>
                  <CardTitle className="text-base">Weak topics</CardTitle>
                </CardHeader>
                <CardContent className="flex flex-wrap gap-2">
                  {d.weakTopics.map((t) => (
                    <Link
                      key={t}
                      href={`/chat?q=${encodeURIComponent(`Help me revise ${t}`)}`}
                      className="rounded-full border border-slate-200 bg-white px-3 py-1 text-xs font-medium text-slate-800 hover:border-blue-600 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
                    >
                      {t}
                    </Link>
                  ))}
                </CardContent>
              </Card>
            )}
          </div>
        </div>
      )}

      {/* Quick actions — no Privacy */}
      <div className="flex flex-wrap gap-2">
        <Link
          href="/library"
          className={cn(buttonVariants({ size: "sm" }), "gap-1.5")}
        >
          <Upload className="size-3.5" /> Upload notes
        </Link>
        <Link
          href="/chat"
          className={cn(
            buttonVariants({ size: "sm", variant: "outline" }),
            "gap-1.5",
          )}
        >
          <MessageSquare className="size-3.5" /> Ask tutor
        </Link>
        <Link
          href="/tests"
          className={cn(
            buttonVariants({ size: "sm", variant: "outline" }),
            "gap-1.5",
          )}
        >
          <ClipboardCheck className="size-3.5" /> Take test
        </Link>
      </div>

      {/* Recent docs + chats */}
      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader className="flex-row items-center justify-between space-y-0">
            <CardTitle className="text-base">Recent documents</CardTitle>
            <Link href="/library" className="text-xs text-blue-600">
              Library
            </Link>
          </CardHeader>
          <CardContent className="space-y-2">
            {d.recentDocuments.length === 0 ? (
              <p className="text-sm text-slate-500">No documents yet.</p>
            ) : (
              d.recentDocuments.map((doc) => (
                <Link
                  key={doc.id}
                  href={`/library/${doc.id}`}
                  className="flex items-center justify-between gap-2 text-sm"
                >
                  <span className="inline-flex min-w-0 items-center gap-2 truncate">
                    <BookOpen className="size-3.5 shrink-0 text-slate-400" />
                    <span className="truncate">{doc.title}</span>
                  </span>
                  <StatusPill status={doc.ingestStatus} progress={doc.ingestProgress} />
                </Link>
              ))
            )}
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex-row items-center justify-between space-y-0">
            <CardTitle className="text-base">Recent chats</CardTitle>
            <Link href="/chat" className="text-xs text-blue-600">
              All
            </Link>
          </CardHeader>
          <CardContent className="space-y-2">
            {d.recentChats.length === 0 ? (
              <p className="text-sm text-slate-500">No chats yet.</p>
            ) : (
              d.recentChats.map((c) => (
                <Link
                  key={c.id}
                  href={`/chat/${c.id}`}
                  className="block truncate text-sm hover:text-blue-600"
                >
                  {c.title || "Chat"}
                </Link>
              ))
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function StatCard({
  title,
  value,
  unit,
  icon: Icon,
  iconClass,
}: {
  title: string;
  value: string;
  unit: string;
  icon: React.ComponentType<{ className?: string }>;
  iconClass?: string;
}) {
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardDescription>{title}</CardDescription>
        <Icon className={cn("size-4 text-blue-600", iconClass)} />
      </CardHeader>
      <CardContent>
        <div className="text-2xl font-semibold tabular-nums tracking-tight">
          {value}
          {unit ? (
            <span className="ml-1 text-sm font-normal text-slate-500">
              {unit}
            </span>
          ) : null}
        </div>
      </CardContent>
    </Card>
  );
}

function StatusPill({
  status,
  progress,
}: {
  status: string;
  progress: number;
}) {
  return (
    <span
      className={cn(
        "shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase",
        status === "READY" &&
          "bg-green-100 text-green-800 dark:bg-green-950 dark:text-green-200",
        status === "FAILED" && "bg-red-100 text-red-800",
        (status === "PENDING" || status === "PROCESSING") &&
          "bg-blue-100 text-blue-800 dark:bg-blue-950 dark:text-blue-200",
      )}
    >
      {status}
      {status === "PROCESSING" ? ` ${progress}%` : ""}
    </span>
  );
}
