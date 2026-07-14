import { useAuth } from "@clerk/expo";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useLocalSearchParams, useRouter } from "expo-router";
import { ActivityIndicator, ScrollView, Text, View } from "react-native";
import { Button } from "../../src/components/ui/button";
import { trpc } from "../../src/trpc";

export default function TestDetailMobile() {
  const { testId } = useLocalSearchParams<{ testId: string }>();
  const { isSignedIn } = useAuth();
  const qc = useQueryClient();
  const router = useRouter();

  const test = useQuery({
    ...trpc.tests.get.queryOptions({ id: testId }),
    enabled: !!isSignedIn && !!testId,
    refetchInterval: 3000,
  });

  const confirm = useMutation(
    trpc.tests.confirmMismatchedPaper.mutationOptions({
      onSuccess: () =>
        void qc.invalidateQueries(trpc.tests.get.queryFilter({ id: testId })),
    }),
  );
  const finish = useMutation(
    trpc.tests.finishReview.mutationOptions({
      onSuccess: () =>
        void qc.invalidateQueries(trpc.tests.get.queryFilter({ id: testId })),
    }),
  );
  const start = useMutation(
    trpc.attempts.start.mutationOptions({
      onSuccess: (r) => router.push(`/exam/${r.attemptId}`),
    }),
  );

  const t = test.data;
  if (!t) {
    return (
      <View className="flex-1 items-center justify-center">
        <ActivityIndicator color="#2563eb" />
      </View>
    );
  }

  return (
    <ScrollView className="flex-1 bg-white px-4 py-4 dark:bg-slate-950">
      <Text className="text-xl font-semibold text-slate-900 dark:text-slate-50">
        {t.title}
      </Text>
      <Text className="mt-1 text-sm text-slate-500">Status: {t.status}</Text>

      {(t.status === "EXTRACTING" || t.status === "GENERATING") && (
        <View className="mt-6 items-center">
          <ActivityIndicator color="#2563eb" />
          <Text className="mt-2 text-sm">Paper is being prepared…</Text>
        </View>
      )}

      {t.status === "NEEDS_REVIEW" && t.failureReason?.includes("syllabus") && (
        <View className="mt-4 rounded-lg border border-amber-300 bg-amber-50 p-3">
          <Text className="text-sm text-amber-900">{t.failureReason}</Text>
          <View className="mt-2 gap-2">
            <Button
              title="Upload another"
              variant="outline"
              onPress={() =>
                confirm.mutate({ id: testId, continueAnyway: false })
              }
            />
            <Button
              title="Continue anyway"
              onPress={() =>
                confirm.mutate({ id: testId, continueAnyway: true })
              }
            />
          </View>
        </View>
      )}

      {t.status === "NEEDS_REVIEW" &&
        !t.failureReason?.includes("syllabus") &&
        t.questions.length > 0 && (
          <View className="mt-4 gap-2">
            <Text className="text-sm text-amber-800">
              Review flagged questions, then finish.
            </Text>
            <Button
              title="Finish review"
              onPress={() => finish.mutate({ testId })}
            />
          </View>
        )}

      {t.status === "READY" && (
        <View className="mt-6">
          <Text className="text-sm text-slate-500">
            {t.questions.length} questions · {t.durationMin} min
          </Text>
          <Button
            title={start.isPending ? "…" : "Start instructions"}
            onPress={() => start.mutate({ testId })}
          />
        </View>
      )}
    </ScrollView>
  );
}
