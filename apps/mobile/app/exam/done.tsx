import { useLocalSearchParams, useRouter } from "expo-router";
import { Text, View } from "react-native";
import { Button } from "../../src/components/ui/button";

export default function ExamDoneMobile() {
  const { attemptId } = useLocalSearchParams<{ attemptId?: string }>();
  const router = useRouter();
  return (
    <View className="flex-1 items-center justify-center bg-white px-6 dark:bg-slate-950">
      <Text className="text-2xl font-semibold text-slate-900 dark:text-slate-50">
        Submitted
      </Text>
      <Text className="mt-2 text-center text-sm text-slate-500">
        Your result will be announced shortly.
        {attemptId ? ` (${attemptId.slice(0, 8)}…)` : ""}
      </Text>
      <Button title="Home" onPress={() => router.replace("/")} />
      <Button
        title="Tests"
        variant="outline"
        onPress={() => router.replace("/tests")}
      />
    </View>
  );
}
