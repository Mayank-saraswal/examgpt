import { useMutation, useQueryClient } from "@tanstack/react-query";
import * as ImagePicker from "expo-image-picker";
import { useRouter } from "expo-router";
import { useState } from "react";
import { Alert, Text, View } from "react-native";
import { Button } from "../src/components/ui/button";
import { Input } from "../src/components/ui/input";
import { trpc } from "../src/trpc";

type ExamChoice = "NEET" | "JEE" | "OTHER";

/**
 * Camera/gallery permission is requested only when user picks upload —
 * not at app launch (TASKS.md Phase 1).
 */
export default function OnboardingScreen() {
  const router = useRouter();
  const qc = useQueryClient();
  const [name, setName] = useState("");
  const [age, setAge] = useState("");
  const [exam, setExam] = useState<ExamChoice>("NEET");
  const [customName, setCustomName] = useState("");
  const [syllabusUrl, setSyllabusUrl] = useState("");
  const [error, setError] = useState<string | null>(null);

  const updateProfile = useMutation(trpc.user.updateProfile.mutationOptions());
  const setExamMut = useMutation(trpc.onboarding.setExam.mutationOptions());
  const fetchSyllabus = useMutation(
    trpc.onboarding.fetchSyllabusFromUrl.mutationOptions(),
  );
  const presign = useMutation(trpc.documents.presignUpload.mutationOptions());
  const register = useMutation(trpc.documents.registerUpload.mutationOptions());

  async function pickSyllabusImage() {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) {
      Alert.alert(
        "Permission needed",
        "Photo library access is required to upload syllabus images. You can continue with a URL instead.",
      );
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ["images"],
      quality: 0.9,
    });
    if (result.canceled || !result.assets[0]) return;
    const asset = result.assets[0];
    try {
      const mime = asset.mimeType ?? "image/jpeg";
      const size = asset.fileSize ?? 1_000_000;
      const { documentId, uploadUrl } = await presign.mutateAsync({
        kind: "SYLLABUS",
        title: customName || "Syllabus image",
        mimeType: mime,
        sizeBytes: size,
        sourceType: "UPLOAD_IMAGE",
      });
      const blob = await (await fetch(asset.uri)).blob();
      const put = await fetch(uploadUrl, {
        method: "PUT",
        headers: { "Content-Type": mime },
        body: blob,
      });
      if (!put.ok) throw new Error(`Upload failed (${put.status})`);
      await register.mutateAsync({ documentId });
      Alert.alert("Uploaded", "Syllabus image registered for ingest.");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Upload failed");
    }
  }

  async function onSubmit() {
    setError(null);
    try {
      await updateProfile.mutateAsync({
        name: name || undefined,
        age: age ? Number(age) : undefined,
      });
      await setExamMut.mutateAsync({
        type: exam,
        customName: exam === "OTHER" ? customName : undefined,
      });
      if (exam === "OTHER" && syllabusUrl.trim()) {
        await fetchSyllabus.mutateAsync({
          url: syllabusUrl.trim(),
          title: customName || "Custom syllabus",
        });
      }
      await qc.invalidateQueries();
      router.replace("/notifications-permission");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Onboarding failed");
    }
  }

  return (
    <View className="flex-1 bg-white px-6 py-8 dark:bg-slate-950">
      <Text className="text-xl font-semibold text-slate-900 dark:text-slate-50">
        Onboarding
      </Text>
      <View className="mt-6 gap-3">
        <Text className="text-sm font-medium text-slate-700">Name</Text>
        <Input value={name} onChangeText={setName} placeholder="Your name" />
        <Text className="text-sm font-medium text-slate-700">Age</Text>
        <Input
          value={age}
          onChangeText={setAge}
          keyboardType="number-pad"
          placeholder="18"
        />
        <Text className="text-sm font-medium text-slate-700">Exam</Text>
        <View className="flex-row flex-wrap gap-2">
          {(["NEET", "JEE", "OTHER"] as const).map((opt) => (
            <Button
              key={opt}
              title={opt === "OTHER" ? "Other" : opt}
              variant={exam === opt ? "default" : "outline"}
              onPress={() => setExam(opt)}
            />
          ))}
        </View>
        {exam === "OTHER" ? (
          <>
            <Input
              value={customName}
              onChangeText={setCustomName}
              placeholder="Custom exam name"
            />
            <Input
              value={syllabusUrl}
              onChangeText={setSyllabusUrl}
              placeholder="Syllabus PDF URL"
              autoCapitalize="none"
            />
            <Button
              title="Upload syllabus image"
              variant="outline"
              onPress={pickSyllabusImage}
            />
          </>
        ) : null}
        {error ? <Text className="text-sm text-error">{error}</Text> : null}
        <Button title="Continue" onPress={onSubmit} />
      </View>
    </View>
  );
}
