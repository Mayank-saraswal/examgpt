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
      <View className="flex-1 items-center justify-center bg-white dark:bg-slate-950">
        <ActivityIndicator color="#2563eb" />
      </View>
    );
  }

  if (!auth.isSignedIn) {
    return (
      <View className="flex-1 items-center justify-center bg-white px-6 dark:bg-slate-950">
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

  return (
    <ScrollView
      className="flex-1 bg-white dark:bg-slate-950"
      contentContainerStyle={{ padding: 16, paddingBottom: 40 }}
    >
      <Text className="text-sm font-medium text-primary-600">Home</Text>
      <Text className="mt-1 text-2xl font-semibold text-slate-900 dark:text-slate-50">
        Hi, {firstName}
      </Text>
      <Text className="mt-1 text-sm text-slate-500">
        {d?.examType ?? "—"}
        {d?.studyStreak != null ? ` · ${d.studyStreak} day streak` : ""}
        {d?.daysToExam != null && d.daysToExam > 0
          ? ` · ${d.daysToExam}d to target`
          : ""}
      </Text>

      {dash.isLoading && (
        <ActivityIndicator color="#2563eb" className="mt-8" />
      )}

      {d?.isNewUser && d.onboarded && d.platformPapers.length > 0 && (
        <View className="mt-6 rounded-xl border border-slate-200 p-4 dark:border-slate-800">
          <Text className="text-lg font-semibold text-slate-900 dark:text-slate-50">
            Try a real past paper now
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
        <View className="mt-6 rounded-xl border border-slate-200 p-4 dark:border-slate-800">
          <Text className="text-lg font-semibold">Get started</Text>
          <Text className="mt-1 text-sm text-slate-500">
            Upload notes · Ask tutor · Take a paper
          </Text>
          <Text className="mt-3 text-sm">
            Notes: {d.checklist.uploadNotes ? "done" : "todo"} · Tutor:{" "}
            {d.checklist.askTutor ? "done" : "todo"} · Paper:{" "}
            {d.checklist.takePaper ? "done" : "todo"}
          </Text>
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
                className="rounded-full border border-amber-200 bg-amber-50 px-3 py-1"
              >
                <Text className="text-xs text-amber-900">{t}</Text>
              </Pressable>
            ))}
          </View>
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
