import { useAuth } from "@clerk/expo";
import { useQuery } from "@tanstack/react-query";
import { Link } from "expo-router";
import { ActivityIndicator, Text, View } from "react-native";
import { Button } from "../src/components/ui/button";
import { trpc } from "../src/trpc";

export default function HomeScreen() {
  const auth = useAuth();
  const health = useQuery(trpc.health.ping.queryOptions());
  const me = useQuery({
    ...trpc.user.me.queryOptions(),
    enabled: !!auth.isSignedIn,
  });

  return (
    <View className="flex-1 items-center justify-center bg-white px-6 dark:bg-slate-950">
      <View className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-6 dark:border-slate-800 dark:bg-slate-900">
        <Text className="text-sm font-medium text-primary-600">ExamGPT</Text>
        <Text className="mt-1 text-2xl font-semibold text-slate-900 dark:text-slate-50">
          AI exam tutor
        </Text>
        <Text className="mt-2 text-sm leading-5 text-slate-500">
          Google or email + password. No phone/SMS auth.
        </Text>

        <View className="mt-6 gap-3">
          {!auth.isLoaded ? (
            <ActivityIndicator color="#2563eb" />
          ) : !auth.isSignedIn ? (
            <Link href="/sign-in" asChild>
              <Button title="Sign in" />
            </Link>
          ) : (
            <>
              <Text className="text-sm text-slate-700 dark:text-slate-200">
                Signed in as {me.data?.name ?? me.data?.email ?? me.data?.id ?? "…"}
              </Text>
              <Link href="/chat" asChild>
                <Button title="Chat tutor" />
              </Link>
              <Link href="/library" asChild>
                <Button title="Library" variant="outline" />
              </Link>
              <Link href="/onboarding" asChild>
                <Button title="Onboarding" variant="outline" />
              </Link>
              <Link href="/notifications-permission" asChild>
                <Button title="Notification permission" variant="outline" />
              </Link>
              <Button
                title="Sign out"
                variant="outline"
                onPress={() => void auth.signOut()}
              />
            </>
          )}
        </View>

        <View className="mt-6 rounded-lg border border-slate-200 bg-slate-50 p-4 dark:border-slate-700 dark:bg-slate-800">
          {health.isLoading ? (
            <ActivityIndicator color="#2563eb" />
          ) : health.isError ? (
            <Text className="font-medium text-error">
              API unreachable: {health.error.message}
            </Text>
          ) : (
            <>
              <Text className="font-medium text-success">health.ping · ok</Text>
              <Text className="mt-2 font-mono text-sm text-slate-800 dark:text-slate-100">
                {health.data?.service}
              </Text>
            </>
          )}
        </View>
      </View>
    </View>
  );
}
