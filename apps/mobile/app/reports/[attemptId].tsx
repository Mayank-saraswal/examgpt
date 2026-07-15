import { useMemo, useState } from "react";
import {
  ActivityIndicator,
  Image,
  Pressable,
  ScrollView,
  Text,
  View,
} from "react-native";
import { Link, useLocalSearchParams } from "expo-router";
import { useAuth } from "@clerk/expo";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { trpc } from "../../src/trpc";

type QRow = {
  questionIndex: number;
  status: string;
  selectedKey: string | null;
  correctKey: string | null;
  timeSpentSec: number;
  confusionNote: string | null;
  isSlow: boolean;
  isConfused: boolean;
  explanation?: string | null;
  notesCitations?: {
    documentId: string;
    title: string;
    pageNumber: number;
  }[];
  imageKeys?: string[];
};

function figureUrl(key: string): string {
  const api = process.env.EXPO_PUBLIC_API_URL ?? "http://localhost:4000";
  return `${api}/storage/local/${key
    .split("/")
    .map(encodeURIComponent)
    .join("/")}`;
}

type TopicRow = {
  topic: string;
  attempted: number;
  correct: number;
  verdict: string;
};

type Filter = "all" | "wrong" | "skipped" | "slow" | "confused";

export default function MobileReportScreen() {
  const { attemptId } = useLocalSearchParams<{ attemptId: string }>();
  const { isSignedIn } = useAuth();
  const qc = useQueryClient();
  const [filter, setFilter] = useState<Filter>("all");
  const [openIdx, setOpenIdx] = useState<number | null>(null);

  const reportOpts = trpc.reports.get.queryOptions({ attemptId: attemptId! });
  const report = useQuery({
    queryKey: reportOpts.queryKey,
    queryFn: reportOpts.queryFn,
    enabled: !!isSignedIn && !!attemptId,
    refetchInterval: (q) => {
      const st = (q.state.data as { status?: string } | undefined)?.status;
      return st === "PROCESSING" || st === "PENDING" ? 3000 : false;
    },
  });

  const reanalyzeOpts = trpc.reports.reanalyze.mutationOptions();
  const reanalyze = useMutation({
    mutationFn: reanalyzeOpts.mutationFn,
    onSuccess: () => void qc.invalidateQueries(),
  });

  const reportData = useMemo(() => {
    if (!report.data) return null;
    return JSON.parse(JSON.stringify(report.data)) as {
      status: string;
      score: number | null;
      maxScore: number | null;
      summary: string | null;
      questionAnalysis: QRow[] | null;
      topicAnalysis: TopicRow[] | null;
      cutoffData: {
        found?: boolean;
        verdict?: string | null;
        notFoundReason?: string;
        sourceUrls?: string[];
      } | null;
      attempt: { test: { title: string } };
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

  if (!isSignedIn) {
    return (
      <View className="flex-1 items-center justify-center bg-white p-6 dark:bg-zinc-950">
        <Text className="text-zinc-600 dark:text-zinc-300">Sign in required</Text>
      </View>
    );
  }

  if (report.isLoading) {
    return (
      <View className="flex-1 items-center justify-center bg-white dark:bg-zinc-950">
        <ActivityIndicator color="#2563eb" />
      </View>
    );
  }

  if (!reportData) {
    return (
      <View className="flex-1 items-center justify-center bg-white p-6 dark:bg-zinc-950">
        <Text className="text-red-600">Report not found</Text>
        <Link href="/" asChild>
          <Pressable className="mt-4 rounded-lg bg-blue-600 px-4 py-2">
            <Text className="text-white">Home</Text>
          </Pressable>
        </Link>
      </View>
    );
  }

  const r = reportData;
  const pending = r.status === "PENDING" || r.status === "PROCESSING";

  return (
    <ScrollView className="flex-1 bg-white dark:bg-zinc-950">
      <View className="gap-4 p-4 pb-16">
        <Text className="text-sm font-medium text-blue-600">Report</Text>
        <Text className="text-2xl font-semibold text-zinc-900 dark:text-zinc-50">
          {r.attempt.test.title}
        </Text>
        <Text className="text-sm text-zinc-500">Status: {r.status}</Text>

        {pending && (
          <View className="flex-row items-center gap-2 rounded-xl border border-zinc-200 p-3 dark:border-zinc-700">
            <ActivityIndicator color="#2563eb" />
            <Text className="flex-1 text-sm text-zinc-600 dark:text-zinc-300">
              Analysis in progress…
            </Text>
          </View>
        )}

        <View className="rounded-xl border border-zinc-200 p-4 dark:border-zinc-700">
          <Text className="text-sm text-zinc-500">Score</Text>
          <Text className="text-3xl font-semibold text-zinc-900 dark:text-zinc-50">
            {r.score ?? "—"} / {r.maxScore ?? "—"}
          </Text>
          {r.summary ? (
            <Text className="mt-3 text-sm leading-5 text-zinc-700 dark:text-zinc-200">
              {r.summary}
            </Text>
          ) : null}
        </View>

        {topics.length > 0 && (
          <View className="rounded-xl border border-zinc-200 p-4 dark:border-zinc-700">
            <Text className="mb-2 text-lg font-semibold text-zinc-900 dark:text-zinc-50">
              Topics
            </Text>
            {topics.map((t) => (
              <Text
                key={t.topic}
                className="mb-1 text-sm text-zinc-700 dark:text-zinc-200"
              >
                {t.topic}: {t.verdict} ({t.correct}/{t.attempted})
              </Text>
            ))}
          </View>
        )}

        <View className="rounded-xl border border-zinc-200 p-4 dark:border-zinc-700">
          <Text className="mb-2 text-lg font-semibold text-zinc-900 dark:text-zinc-50">
            {(cutoff as { type?: string } | null)?.type === "target_score"
              ? "Target score"
              : "Cutoff"}
          </Text>
          <Text className="text-sm text-zinc-600 dark:text-zinc-300">
            {cutoff?.found
              ? cutoff.verdict ?? "Found"
              : cutoff?.notFoundReason ??
                "Cutoff not found — no numbers invented."}
          </Text>
        </View>

        <View className="flex-row flex-wrap gap-2">
          {(["all", "wrong", "skipped", "slow", "confused"] as Filter[]).map(
            (f) => (
              <Pressable
                key={f}
                onPress={() => setFilter(f)}
                className={`rounded-full px-3 py-1 ${
                  filter === f ? "bg-blue-600" : "border border-zinc-300"
                }`}
              >
                <Text
                  className={`text-xs capitalize ${
                    filter === f ? "text-white" : "text-zinc-600"
                  }`}
                >
                  {f}
                </Text>
              </Pressable>
            ),
          )}
        </View>

        {questions.map((q) => {
          const open = openIdx === q.questionIndex;
          return (
            <Pressable
              key={q.questionIndex}
              onPress={() => setOpenIdx(open ? null : q.questionIndex)}
              className="rounded-xl border border-zinc-200 p-3 dark:border-zinc-700"
            >
              <View className="flex-row flex-wrap items-center gap-2">
                <Text className="font-medium text-zinc-900 dark:text-zinc-50">
                  Q{q.questionIndex + 1}
                </Text>
                <Text
                  style={{
                    fontSize: 10,
                    fontWeight: "700",
                    textTransform: "uppercase",
                    overflow: "hidden",
                    borderRadius: 999,
                    paddingHorizontal: 8,
                    paddingVertical: 2,
                    color: "#fff",
                    backgroundColor:
                      q.status === "correct"
                        ? "#22c55e"
                        : q.status === "wrong"
                          ? "#ef4444"
                          : q.status === "skipped"
                            ? "#9ca3af"
                            : "#7c3aed",
                  }}
                >
                  {q.status}
                </Text>
                {q.isSlow ? (
                  <Text className="text-xs text-amber-600">slow</Text>
                ) : null}
                {q.isConfused ? (
                  <Text
                    style={{
                      fontSize: 10,
                      fontWeight: "700",
                      color: "#fff",
                      backgroundColor: "#7c3aed",
                      paddingHorizontal: 8,
                      paddingVertical: 2,
                      borderRadius: 999,
                      overflow: "hidden",
                    }}
                  >
                    review
                  </Text>
                ) : null}
              </View>
              <Text className="mt-1 text-xs text-zinc-500">
                You {q.selectedKey ?? "—"} · Correct {q.correctKey ?? "—"} ·{" "}
                {q.timeSpentSec}s
              </Text>
              {open && (
                <View className="mt-2">
                  {q.confusionNote ? (
                    <Text className="mb-1 text-sm text-amber-700">
                      {q.confusionNote}
                    </Text>
                  ) : null}
                  {q.imageKeys?.map((key) => (
                    <View key={key} className="mb-2 overflow-hidden rounded-lg border border-zinc-200">
                      <Image
                        source={{ uri: figureUrl(key) }}
                        style={{ width: "100%", height: 160 }}
                        resizeMode="contain"
                        accessibilityLabel={`Figure for Q${q.questionIndex + 1}`}
                      />
                      <Text className="px-2 py-1 text-xs text-zinc-400">
                        If missing, report this question.
                      </Text>
                    </View>
                  ))}
                  <Text className="text-sm text-zinc-700 dark:text-zinc-200">
                    {q.explanation ?? "No explanation."}
                  </Text>
                  {q.notesCitations?.map((c) => (
                    <Link
                      key={`${c.documentId}-${c.pageNumber}`}
                      href={`/library/${c.documentId}?page=${c.pageNumber}`}
                      asChild
                    >
                      <Pressable className="mt-2 self-start rounded-full border border-zinc-300 px-2 py-1">
                        <Text className="text-xs text-blue-600">
                          {c.title.slice(0, 20)} p.{c.pageNumber}
                        </Text>
                      </Pressable>
                    </Link>
                  ))}
                </View>
              )}
            </Pressable>
          );
        })}

        <Pressable
          disabled={reanalyze.isPending || pending}
          onPress={() => reanalyze.mutate({ attemptId: attemptId! })}
          className="items-center rounded-xl bg-blue-600 py-3"
        >
          <Text className="font-medium text-white">
            {reanalyze.isPending ? "Queueing…" : "Re-analyze"}
          </Text>
        </Pressable>

        <Link href="/" asChild>
          <Pressable className="items-center py-2">
            <Text className="text-blue-600">Home</Text>
          </Pressable>
        </Link>
      </View>
    </ScrollView>
  );
}
