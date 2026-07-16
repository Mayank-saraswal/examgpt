import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import * as Notifications from "expo-notifications";
import { useRouter } from "expo-router";
import { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  Text,
  View,
} from "react-native";
import { Button } from "../src/components/ui/button";
import { Input } from "../src/components/ui/input";
import { trpc } from "../src/trpc";

type ExamChoice = "NEET" | "JEE" | "OTHER";
type Step = "profile" | "exam" | "targets" | "notifications";

export default function OnboardingScreen() {
  const router = useRouter();
  const qc = useQueryClient();
  const status = useQuery(trpc.onboarding.status.queryOptions());

  const [step, setStep] = useState<Step>("profile");
  const [name, setName] = useState("");
  const [age, setAge] = useState("");
  const [exam, setExam] = useState<ExamChoice>("NEET");
  const [customName, setCustomName] = useState("");
  const [syllabusUrl, setSyllabusUrl] = useState("");
  const [targetYear, setTargetYear] = useState(
    String(new Date().getFullYear() + 1),
  );
  const [targetScore, setTargetScore] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [hydrated, setHydrated] = useState(false);

  const save = useMutation(trpc.onboarding.saveProgress.mutationOptions());
  const complete = useMutation(trpc.onboarding.complete.mutationOptions());

  useEffect(() => {
    if (!status.data || hydrated) return;
    if (status.data.onboarded) {
      router.replace("/");
      return;
    }
    const s = status.data.step as Step | "done";
    if (s === "profile" || s === "exam" || s === "targets" || s === "notifications") {
      setStep(s);
    }
    if (status.data.name) setName(status.data.name);
    if (status.data.age != null) setAge(String(status.data.age));
    if (status.data.exam?.type) setExam(status.data.exam.type);
    if (status.data.exam?.customName)
      setCustomName(status.data.exam.customName);
    if (status.data.exam?.targetYear)
      setTargetYear(String(status.data.exam.targetYear));
    if (status.data.exam?.targetScore != null)
      setTargetScore(String(status.data.exam.targetScore));
    setHydrated(true);
  }, [status.data, hydrated, router]);

  async function finishAfterNotif(skip = false) {
    setError(null);
    try {
      if (!skip) {
        await Notifications.requestPermissionsAsync();
      }
      await save.mutateAsync({
        step: "done",
        targetYear: targetYear ? Number(targetYear) : null,
        targetScore: targetScore ? Number(targetScore) : null,
      });
      await complete.mutateAsync();
      void qc.invalidateQueries();
      router.replace("/");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed");
    }
  }

  if (status.isLoading && !hydrated) {
    return (
      <View className="flex-1 items-center justify-center bg-white">
        <ActivityIndicator color="#2563eb" />
      </View>
    );
  }

  const steps: Step[] = ["profile", "exam", "targets", "notifications"];
  const idx = steps.indexOf(step);

  return (
    <ScrollView
      className="flex-1 bg-white dark:bg-slate-950"
      contentContainerStyle={{ padding: 20, paddingBottom: 40 }}
    >
      <Text className="text-sm font-medium text-primary-600">Setup</Text>
      <Text className="mt-1 text-2xl font-semibold text-slate-900 dark:text-slate-50">
        Step {idx + 1} of {steps.length}
      </Text>
      <View className="mt-3 flex-row gap-1.5">
        {steps.map((s, i) => (
          <View
            key={s}
            className={`h-1.5 flex-1 rounded-full ${
              i <= idx ? "bg-primary-600" : "bg-slate-200"
            }`}
          />
        ))}
      </View>

      {step === "profile" && (
        <View className="mt-6 gap-3">
          <Text className="text-sm text-slate-500">Name</Text>
          <Input value={name} onChangeText={setName} placeholder="Your name" />
          <Text className="text-sm text-slate-500">Age</Text>
          <Input
            value={age}
            onChangeText={setAge}
            keyboardType="number-pad"
            placeholder="17"
          />
          <Button
            title="Continue"
            onPress={() => {
              void save
                .mutateAsync({
                  step: "exam",
                  name: name.trim(),
                  age: Number(age),
                })
                .then(() => setStep("exam"))
                .catch((e: Error) => setError(e.message));
            }}
          />
        </View>
      )}

      {step === "exam" && (
        <View className="mt-6 gap-3">
          {(["NEET", "JEE", "OTHER"] as const).map((opt) => (
            <Pressable
              key={opt}
              onPress={() => setExam(opt)}
              className={`rounded-xl border p-4 ${
                exam === opt
                  ? "border-primary-600 bg-primary-50"
                  : "border-slate-200"
              }`}
            >
              <Text className="font-semibold text-slate-900">{opt}</Text>
              <Text className="mt-1 text-xs text-slate-500">
                {opt === "OTHER"
                  ? "Upload syllabus via URL (HTML supported with Firecrawl)"
                  : "Bundled syllabus topics"}
              </Text>
            </Pressable>
          ))}
          {exam === "OTHER" && (
            <>
              <Input
                value={customName}
                onChangeText={setCustomName}
                placeholder="Exam name"
              />
              <Input
                value={syllabusUrl}
                onChangeText={setSyllabusUrl}
                placeholder="Syllabus URL"
                autoCapitalize="none"
              />
            </>
          )}
          <Button
            title="Continue"
            onPress={() => {
              void save
                .mutateAsync({
                  step: "targets",
                  examType: exam,
                  customName: exam === "OTHER" ? customName : undefined,
                  syllabusUrl:
                    exam === "OTHER" && syllabusUrl.trim()
                      ? syllabusUrl.trim()
                      : undefined,
                })
                .then(() => setStep("targets"))
                .catch((e: Error) => setError(e.message));
            }}
          />
          <Button title="Back" variant="outline" onPress={() => setStep("profile")} />
        </View>
      )}

      {step === "targets" && (
        <View className="mt-6 gap-3">
          <Text className="text-sm text-slate-500">Target year (optional)</Text>
          <Input
            value={targetYear}
            onChangeText={setTargetYear}
            keyboardType="number-pad"
          />
          <Text className="text-sm text-slate-500">Target score (optional)</Text>
          <Input
            value={targetScore}
            onChangeText={setTargetScore}
            keyboardType="number-pad"
          />
          <Button
            title="Continue"
            onPress={() => {
              void save
                .mutateAsync({
                  step: "notifications",
                  targetYear: targetYear ? Number(targetYear) : null,
                  targetScore: targetScore ? Number(targetScore) : null,
                })
                .then(() => setStep("notifications"))
                .catch((e: Error) => setError(e.message));
            }}
          />
          <Button
            title="Skip"
            variant="outline"
            onPress={() => setStep("notifications")}
          />
          <Button title="Back" variant="outline" onPress={() => setStep("exam")} />
        </View>
      )}

      {step === "notifications" && (
        <View className="mt-6 gap-3">
          <Text className="text-base font-semibold text-slate-900 dark:text-slate-50">
            Stay in the loop
          </Text>
          <Text className="text-sm leading-5 text-slate-500">
            Enable alerts when a paper is ready or your report is done — so you
            never wait at a spinner.
          </Text>
          <Button
            title="Enable notifications"
            onPress={() => void finishAfterNotif(false)}
          />
          <Button
            title="Not now"
            variant="outline"
            onPress={() => void finishAfterNotif(true)}
          />
        </View>
      )}

      {error ? (
        <Text className="mt-4 text-sm text-red-600">{error}</Text>
      ) : null}
    </ScrollView>
  );
}
