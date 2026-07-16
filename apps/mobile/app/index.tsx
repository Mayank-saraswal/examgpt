import { useAuth } from "@clerk/expo";
import { useQuery } from "@tanstack/react-query";
import { Link, useRouter } from "expo-router";
import { useEffect, useState } from "react";
import { ActivityIndicator, Pressable, Text, View } from "react-native";
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
          <Pressable
            onPress={() => router.push("/welcome")}
            className="mt-4"
          >
            <Text className="text-center text-xs text-slate-400">
              Privacy &amp; Terms available on the website
            </Text>
          </Pressable>
        </View>
      </View>
    );
  }

  const firstName = (me.data?.name ?? "Student").split(" ")[0];
  const exam = me.data?.exam?.type ?? "—";

  return (
    <View className="flex-1 bg-white px-4 py-6 dark:bg-slate-950">
      <Text className="text-sm font-medium text-primary-600">Home</Text>
      <Text className="mt-1 text-2xl font-semibold text-slate-900 dark:text-slate-50">
        Hi, {firstName}
      </Text>
      <Text className="mt-1 text-sm text-slate-500">{exam}</Text>

      <View className="mt-6 gap-3">
        {!me.data?.onboarded ? (
          <Link href="/onboarding" asChild>
            <Button title="Complete onboarding" />
          </Link>
        ) : null}
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
    </View>
  );
}
