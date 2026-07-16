import { useAuth } from "@clerk/expo";
import { useQuery } from "@tanstack/react-query";
import { Link, useRouter } from "expo-router";
import { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  Text,
  View,
} from "react-native";
import { Button } from "../src/components/ui/button";
import { trpc } from "../src/trpc";
import { hasSeenWelcome } from "./welcome";

export default function HomeScreen() {
  const auth = useAuth();
  const router = useRouter();
  const [welcomeChecked, setWelcomeChecked] = useState(false);

  const me = useQuery({
    ...trpc.user.me.queryOptions(),
    enabled: !!auth.isSignedIn,
  });
  const dash = useQuery({
    ...trpc.reports.dashboard.queryOptions(),
    enabled: !!auth.isSignedIn,
    refetchInterval: (q) => {
      const docs = q.state.data?.recentDocuments ?? [];
      const busy = docs.some(
        (d) =>
          d.ingestStatus === "PENDING" || d.ingestStatus === "PROCESSING",
      );
      return busy ? 3000 : false;
    },
  });

  useEffect(() => {
    if (!auth.isLoaded) return;
    if (auth.isSignedIn) {
      setWelcomeChecked(true);
      return;
    }
    void hasSeenWelcome().then((seen) => {
      if (!seen) router.replace("/welcome");
      else setWelcomeChecked(true);
    });
  }, [auth.isLoaded, auth.isSignedIn, router]);

  useEffect(() => {
    if (auth.isSignedIn && me.data && !me.data.onboarded) {
      router.replace("/onboarding");
    }
  }, [auth.isSignedIn, me.data, router]);

  if (!auth.isLoaded || !welcomeChecked) {
    return (
      <View className="flex-1 items-center justify-center bg-slate-50 dark:bg-slate-950">
        <ActivityIndicator color="#2563eb" />
      </View>
    );
  }

  if (!auth.isSignedIn) {
    return (
      <View className="flex-1 items-center justify-center bg-slate-50 px-6 dark:bg-slate-950">
        <View className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-6 dark:border-slate-800 dark:bg-slate-900">
          <Text className="text-sm font-medium text-primary-600">ExamGPT</Text>
          <Text className="mt-1 text-2xl font-semibold text-slate-900 dark:text-slate-50">
            Study from your notes
          </Text>
          <Text className="mt-2 text-sm leading-5 text-slate-500">
            Page citations, NTA-style mocks, and reports that find weak topics.
          </Text>
          <View className="mt-6 gap-3">
            <Link href="/sign-in" asChild>
              <Button title="Sign in" />
            </Link>
            <Link href="/welcome" asChild>
              <Button title="See how it works" variant="outline" />
            </Link>
          </View>
        </View>
      </View>
    );
  }

  const d = dash.data;
  const firstName = d?.firstName ?? me.data?.name?.split(" ")[0] ?? "Student";
  const testsTaken = d?.scoreTrend.length ?? 0;
  const avgScore =
    testsTaken > 0 && d
      ? Math.round(d.scoreTrend.reduce((s, r) => s + r.pct, 0) / testsTaken)
      : null;

  return (
    <ScrollView
      className="flex-1 bg-slate-50 dark:bg-slate-950"
      contentContainerStyle={{ padding: 16, paddingBottom: 40 }}
    >
      <Text className="text-sm font-medium text-primary-600">Home</Text>
      <Text className="mt-1 text-2xl font-semibold text-slate-900 dark:text-slate-50">
        Hi, {firstName}
      </Text>
      <Text className="mt-1 text-sm text-slate-500">
        {d?.examType ?? "Set your exam in onboarding"}
        {d?.daysToExam != null && d.daysToExam > 0
          ? ` · ${d.daysToExam} days to target`
          : ""}
      </Text>

      {dash.isLoading && (
        <ActivityIndicator color="#2563eb" className="mt-8" />
      )}

      {dash.isError && (
        <View className="mt-6 rounded-xl border border-red-200 bg-red-50 p-4 dark:border-red-900 dark:bg-red-950/30">
          <Text className="text-sm text-red-800 dark:text-red-200">
            Could not load dashboard. Pull to refresh or try again later.
          </Text>
          <Pressable onPress={() => void dash.refetch()} className="mt-2">
            <Text className="text-sm font-medium text-blue-600">Retry</Text>
          </Pressable>
        </View>
      )}

      {d && (
        <View className="mt-6 flex-row flex-wrap gap-3">
          <StatTile
            label="Streak"
            value={`${d.studyStreak}`}
            unit="days"
          />
          <StatTile label="Tests" value={`${testsTaken}`} unit="scored" />
          <StatTile
            label="Avg score"
            value={avgScore != null ? `${avgScore}` : "—"}
            unit={avgScore != null ? "%" : ""}
          />
          <StatTile
            label="To exam"
            value={
              d.daysToExam != null && d.daysToExam > 0
                ? `${d.daysToExam}`
                : "—"
            }
            unit="days"
          />
        </View>
      )}

      {d?.isNewUser && d.onboarded && d.platformPapers.length > 0 && (
        <View className="mt-6 rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
          <Text className="text-lg font-semibold text-slate-900 dark:text-slate-50">
            Try a real past paper now
          </Text>
          <Text className="mt-1 text-sm text-slate-500">
            Published previous-year papers — no upload wait.
          </Text>
          {d.platformPapers.slice(0, 3).map((p) => (
            <Pressable
              key={p.id}
              onPress={() => router.push(`/tests/${p.id}`)}
              className="mt-2 rounded-lg border border-slate-100 px-3 py-2 dark:border-slate-800"
            >
              <Text className="font-medium text-slate-800 dark:text-slate-100">
                {p.title}
              </Text>
              <Text className="text-xs text-slate-500">
                {p.paperYear ?? "—"} · {p._count.questions} Q
              </Text>
            </Pressable>
          ))}
        </View>
      )}

      {d?.isNewUser && d.onboarded && d.platformPapers.length === 0 && (
        <View className="mt-6 rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
          <Text className="text-lg font-semibold text-slate-900 dark:text-slate-50">
            Get started
          </Text>
          <Text className="mt-1 text-sm text-slate-500">
            Three steps driven by your real activity.
          </Text>
          <Text className="mt-3 text-sm text-slate-700 dark:text-slate-300">
            Notes: {d.checklist.uploadNotes ? "done" : "todo"} · Tutor:{" "}
            {d.checklist.askTutor ? "done" : "todo"} · Paper:{" "}
            {d.checklist.takePaper ? "done" : "todo"}
          </Text>
        </View>
      )}

      {d && !d.isNewUser && d.recommendedNext && (
        <View className="mt-6 rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
          <Text className="text-sm font-medium text-blue-600">
            Recommended next
          </Text>
          <Text className="mt-1 text-base font-semibold text-slate-900 dark:text-slate-50">
            {d.recommendedNext.topic}
          </Text>
          <Text className="mt-1 text-sm text-slate-500">
            {d.recommendedNext.action}
          </Text>
          <Pressable
            onPress={() => router.push("/chat")}
            className="mt-3 self-start rounded-md bg-blue-600 px-3 py-2"
          >
            <Text className="text-sm font-medium text-white">Practice in chat</Text>
          </Pressable>
        </View>
      )}

      {d && !d.isNewUser && d.weakTopics.length > 0 && (
        <View className="mt-6">
          <Text className="font-semibold text-slate-900 dark:text-slate-50">
            Weak topics
          </Text>
          <View className="mt-2 flex-row flex-wrap gap-2">
            {d.weakTopics.map((t) => (
              <Pressable
                key={t}
                onPress={() => router.push("/chat")}
                className="rounded-full border border-slate-200 bg-white px-3 py-1 dark:border-slate-700 dark:bg-slate-900"
              >
                <Text className="text-xs font-medium text-slate-800 dark:text-slate-100">
                  {t}
                </Text>
              </Pressable>
            ))}
          </View>
        </View>
      )}

      {d && (d.recentDocuments.length > 0 || d.recentChats.length > 0) && (
        <View className="mt-6 gap-4">
          {d.recentDocuments.length > 0 && (
            <View className="rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
              <Text className="font-semibold text-slate-900 dark:text-slate-50">
                Recent documents
              </Text>
              {d.recentDocuments.slice(0, 3).map((doc) => (
                <Pressable
                  key={doc.id}
                  onPress={() => router.push(`/library/${doc.id}`)}
                  className="mt-2 flex-row items-center justify-between"
                >
                  <Text
                    className="flex-1 truncate text-sm text-slate-700 dark:text-slate-200"
                    numberOfLines={1}
                  >
                    {doc.title}
                  </Text>
                  <Text className="ml-2 text-[10px] font-semibold uppercase text-blue-600">
                    {doc.ingestStatus}
                  </Text>
                </Pressable>
              ))}
            </View>
          )}
          {d.recentChats.length > 0 && (
            <View className="rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
              <Text className="font-semibold text-slate-900 dark:text-slate-50">
                Recent chats
              </Text>
              {d.recentChats.slice(0, 3).map((c) => (
                <Pressable
                  key={c.id}
                  onPress={() => router.push(`/chat/${c.id}`)}
                  className="mt-2"
                >
                  <Text
                    className="text-sm text-slate-700 dark:text-slate-200"
                    numberOfLines={1}
                  >
                    {c.title || "Chat"}
                  </Text>
                </Pressable>
              ))}
            </View>
          )}
        </View>
      )}

      <View className="mt-6 gap-3">
        <Link href="/chat" asChild>
          <Button title="Ask tutor" />
        </Link>
        <Link href="/tests" asChild>
          <Button title="Take a test" variant="outline" />
        </Link>
        <Link href="/library" asChild>
          <Button title="Library" variant="outline" />
        </Link>
        <Button
          title="Sign out"
          variant="outline"
          onPress={() => void auth.signOut()}
        />
      </View>
    </ScrollView>
  );
}

function StatTile({
  label,
  value,
  unit,
}: {
  label: string;
  value: string;
  unit: string;
}) {
  return (
    <View className="min-w-[45%] flex-1 rounded-xl border border-slate-200 bg-white p-3 dark:border-slate-800 dark:bg-slate-900">
      <Text className="text-xs text-slate-500">{label}</Text>
      <Text className="mt-1 text-xl font-semibold tabular-nums text-slate-900 dark:text-slate-50">
        {value}
        {unit ? (
          <Text className="text-xs font-normal text-slate-500"> {unit}</Text>
        ) : null}
      </Text>
    </View>
  );
}
