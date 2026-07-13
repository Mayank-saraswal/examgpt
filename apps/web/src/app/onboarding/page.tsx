"use client";

import { useAuth } from "@clerk/nextjs";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useTRPC } from "@/trpc/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

type ExamChoice = "NEET" | "JEE" | "OTHER";

export default function OnboardingPage() {
  const { isSignedIn, isLoaded } = useAuth();
  const router = useRouter();
  const trpc = useTRPC();
  const qc = useQueryClient();

  const me = useQuery({
    ...trpc.user.me.queryOptions(),
    enabled: isLoaded && !!isSignedIn,
  });

  const [name, setName] = useState("");
  const [age, setAge] = useState("");
  const [exam, setExam] = useState<ExamChoice>("NEET");
  const [customName, setCustomName] = useState("");
  const [syllabusUrl, setSyllabusUrl] = useState("");
  const [error, setError] = useState<string | null>(null);

  const updateProfile = useMutation(
    trpc.user.updateProfile.mutationOptions({
      onSuccess: () => qc.invalidateQueries(trpc.user.me.queryFilter()),
    }),
  );
  const setExamMut = useMutation(
    trpc.onboarding.setExam.mutationOptions({
      onSuccess: () => qc.invalidateQueries(trpc.user.me.queryFilter()),
    }),
  );
  const fetchSyllabus = useMutation(
    trpc.onboarding.fetchSyllabusFromUrl.mutationOptions(),
  );

  if (!isLoaded) {
    return <p className="p-8 text-sm text-[var(--eg-muted-fg)]">Loading…</p>;
  }
  if (!isSignedIn) {
    router.replace("/sign-in");
    return null;
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
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
      router.push("/dashboard");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Onboarding failed");
    }
  }

  return (
    <div className="mx-auto flex min-h-full w-full max-w-lg flex-col justify-center px-6 py-12">
      <h1 className="text-2xl font-semibold tracking-tight">Welcome to ExamGPT</h1>
      <p className="mt-2 text-sm text-[var(--eg-muted-fg)]">
        Tell us about yourself and your target exam.
      </p>

      <form onSubmit={onSubmit} className="mt-8 space-y-5">
        <div className="space-y-2">
          <Label htmlFor="name">Name</Label>
          <Input
            id="name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder={me.data?.name ?? "Your name"}
            required
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="age">Age</Label>
          <Input
            id="age"
            type="number"
            min={10}
            max={100}
            value={age}
            onChange={(e) => setAge(e.target.value)}
            required
          />
        </div>
        <div className="space-y-2">
          <Label>Exam</Label>
          <div className="flex flex-wrap gap-2">
            {(["NEET", "JEE", "OTHER"] as const).map((opt) => (
              <Button
                key={opt}
                type="button"
                variant={exam === opt ? "default" : "outline"}
                onClick={() => setExam(opt)}
              >
                {opt === "OTHER" ? "Other" : opt}
              </Button>
            ))}
          </div>
        </div>
        {exam === "OTHER" && (
          <>
            <div className="space-y-2">
              <Label htmlFor="custom">Custom exam name</Label>
              <Input
                id="custom"
                value={customName}
                onChange={(e) => setCustomName(e.target.value)}
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="url">Syllabus PDF URL (optional for now)</Label>
              <Input
                id="url"
                type="url"
                value={syllabusUrl}
                onChange={(e) => setSyllabusUrl(e.target.value)}
                placeholder="https://example.com/syllabus.pdf"
              />
              <p className="text-xs text-[var(--eg-muted-fg)]">
                Or upload a PDF later from the library. File upload uses R2
                presigned URLs when configured.
              </p>
            </div>
          </>
        )}
        {error && (
          <p className="text-sm text-[var(--eg-error)]" role="alert">
            {error}
          </p>
        )}
        <Button
          type="submit"
          className="w-full"
          disabled={updateProfile.isPending || setExamMut.isPending}
        >
          Continue
        </Button>
      </form>
    </div>
  );
}
