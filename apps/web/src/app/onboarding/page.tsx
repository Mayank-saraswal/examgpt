"use client";

import { useAuth } from "@clerk/nextjs";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import {
  Atom,
  Calculator,
  ChevronRight,
  GraduationCap,
  Loader2,
} from "lucide-react";
import { useTRPC } from "@/trpc/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

type ExamChoice = "NEET" | "JEE" | "OTHER";
type Step = "profile" | "exam" | "targets" | "done";

const STEPS: Step[] = ["profile", "exam", "targets"];

export default function OnboardingPage() {
  const { isSignedIn, isLoaded } = useAuth();
  const router = useRouter();
  const trpc = useTRPC();
  const qc = useQueryClient();

  const status = useQuery({
    ...trpc.onboarding.status.queryOptions(),
    enabled: isLoaded && !!isSignedIn,
  });

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

  // Hydrate wizard once from server status (resume mid-flow).
  useEffect(() => {
    if (!status.data || hydrated) return;
    if (status.data.onboarded) {
      router.replace("/dashboard");
      return;
    }
    queueMicrotask(() => {
      const s = status.data!.step;
      if (s === "profile" || s === "exam" || s === "targets") {
        setStep(s);
      } else if (s === "notifications") {
        setStep("targets");
      }
      if (status.data!.name) setName(status.data!.name);
      if (status.data!.age != null) setAge(String(status.data!.age));
      if (status.data!.exam?.type) setExam(status.data!.exam.type);
      if (status.data!.exam?.customName)
        setCustomName(status.data!.exam.customName);
      if (status.data!.exam?.targetYear)
        setTargetYear(String(status.data!.exam.targetYear));
      if (status.data!.exam?.targetScore != null)
        setTargetScore(String(status.data!.exam.targetScore));
      setHydrated(true);
    });
  }, [status.data, hydrated, router]);

  if (!isLoaded || (isSignedIn && status.isLoading && !hydrated)) {
    return (
      <div className="flex min-h-dvh items-center justify-center">
        <Loader2 className="size-8 animate-spin text-[var(--eg-primary)]" />
      </div>
    );
  }
  if (!isSignedIn) {
    router.replace("/sign-in");
    return null;
  }

  const stepIndex = STEPS.indexOf(step);

  async function goProfileNext() {
    setError(null);
    if (!name.trim() || !age) {
      setError("Name and age are required");
      return;
    }
    try {
      await save.mutateAsync({
        step: "exam",
        name: name.trim(),
        age: Number(age),
      });
      setStep("exam");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Save failed");
    }
  }

  async function goExamNext() {
    setError(null);
    if (exam === "OTHER" && !customName.trim()) {
      setError("Custom exam name is required");
      return;
    }
    try {
      await save.mutateAsync({
        step: "targets",
        examType: exam,
        customName: exam === "OTHER" ? customName.trim() : undefined,
        syllabusUrl:
          exam === "OTHER" && syllabusUrl.trim()
            ? syllabusUrl.trim()
            : undefined,
        syllabusTitle: customName || "Custom syllabus",
      });
      setStep("targets");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Save failed");
    }
  }

  async function finish(skipTargets = false) {
    setError(null);
    try {
      if (!skipTargets) {
        await save.mutateAsync({
          step: "done",
          targetYear: targetYear ? Number(targetYear) : null,
          targetScore: targetScore ? Number(targetScore) : null,
        });
      } else {
        await save.mutateAsync({ step: "done" });
      }
      await complete.mutateAsync();
      void qc.invalidateQueries();
      router.push("/dashboard");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not finish onboarding");
    }
  }

  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-lg flex-col px-6 py-10">
      <p className="text-sm font-medium text-[var(--eg-primary)]">ExamGPT</p>
      <h1 className="mt-1 text-2xl font-semibold tracking-tight">
        Set up your prep
      </h1>
      <p className="mt-1 text-sm text-[var(--eg-muted-fg)]">
        Step {Math.max(1, stepIndex + 1)} of {STEPS.length}
      </p>

      <div className="mt-4 flex gap-1.5">
        {STEPS.map((s, i) => (
          <div
            key={s}
            className={cn(
              "h-1.5 flex-1 rounded-full",
              i <= stepIndex
                ? "bg-[var(--eg-primary)]"
                : "bg-[var(--eg-border)]",
            )}
          />
        ))}
      </div>

      {step === "profile" && (
        <div className="mt-8 space-y-5">
          <div className="space-y-2">
            <Label htmlFor="name">Name</Label>
            <Input
              id="name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Your name"
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
          <Button
            type="button"
            className="w-full gap-1"
            disabled={save.isPending}
            onClick={() => void goProfileNext()}
          >
            Continue <ChevronRight className="size-4" />
          </Button>
        </div>
      )}

      {step === "exam" && (
        <div className="mt-8 space-y-4">
          <p className="text-sm text-[var(--eg-muted-fg)]">
            Choose your exam (required). Other opens a custom syllabus path.
          </p>
          {(
            [
              {
                id: "NEET" as const,
                title: "NEET",
                desc: "Medical entrance · bundled syllabus",
                Icon: Atom,
              },
              {
                id: "JEE" as const,
                title: "JEE",
                desc: "Engineering entrance · bundled syllabus",
                Icon: Calculator,
              },
              {
                id: "OTHER" as const,
                title: "Other",
                desc: "Upload or link your own syllabus",
                Icon: GraduationCap,
              },
            ] as const
          ).map((opt) => (
            <button
              key={opt.id}
              type="button"
              onClick={() => setExam(opt.id)}
              className={cn(
                "flex w-full items-start gap-3 rounded-xl border p-4 text-left transition-colors",
                exam === opt.id
                  ? "border-[var(--eg-primary)] bg-blue-50 dark:bg-blue-950/40"
                  : "border-[var(--eg-border)] hover:bg-[var(--eg-muted)]/40",
              )}
            >
              <opt.Icon className="mt-0.5 size-6 text-[var(--eg-primary)]" />
              <span>
                <span className="block font-semibold">{opt.title}</span>
                <span className="mt-0.5 block text-sm text-[var(--eg-muted-fg)]">
                  {opt.desc}
                </span>
              </span>
            </button>
          ))}
          {exam === "OTHER" && (
            <div className="space-y-3 rounded-xl border border-[var(--eg-border)] p-4">
              <div className="space-y-2">
                <Label htmlFor="custom">Exam name</Label>
                <Input
                  id="custom"
                  value={customName}
                  onChange={(e) => setCustomName(e.target.value)}
                  placeholder="e.g. CUET"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="url">Syllabus URL (PDF or HTML)</Label>
                <Input
                  id="url"
                  type="url"
                  value={syllabusUrl}
                  onChange={(e) => setSyllabusUrl(e.target.value)}
                  placeholder="https://…"
                />
                <p className="text-xs text-[var(--eg-muted-fg)]">
                  HTML pages need FIRECRAWL_API_KEY on the server. You can also
                  upload from Library later.
                </p>
              </div>
            </div>
          )}
          <div className="flex gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => setStep("profile")}
            >
              Back
            </Button>
            <Button
              type="button"
              className="flex-1 gap-1"
              disabled={save.isPending}
              onClick={() => void goExamNext()}
            >
              Continue <ChevronRight className="size-4" />
            </Button>
          </div>
        </div>
      )}

      {step === "targets" && (
        <div className="mt-8 space-y-5">
          <div className="space-y-2">
            <Label htmlFor="year">Target year (optional)</Label>
            <Input
              id="year"
              type="number"
              min={2020}
              max={2040}
              value={targetYear}
              onChange={(e) => setTargetYear(e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="score">Target score (optional)</Label>
            <Input
              id="score"
              type="number"
              min={0}
              max={1000}
              value={targetScore}
              onChange={(e) => setTargetScore(e.target.value)}
              placeholder="e.g. 650"
            />
          </div>
          <div className="flex flex-col gap-2">
            <Button
              type="button"
              className="w-full"
              disabled={complete.isPending || save.isPending}
              onClick={() => void finish(false)}
            >
              {complete.isPending ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                "Finish & go to dashboard"
              )}
            </Button>
            <button
              type="button"
              className="text-sm text-[var(--eg-muted-fg)] hover:text-[var(--eg-fg)]"
              onClick={() => void finish(true)}
            >
              Skip targets
            </button>
            <Button
              type="button"
              variant="outline"
              onClick={() => setStep("exam")}
            >
              Back
            </Button>
          </div>
        </div>
      )}

      {error && (
        <p className="mt-4 text-sm text-red-600" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
