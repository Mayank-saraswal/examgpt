"use client";

import { useAuth } from "@clerk/nextjs";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { useMemo, useState } from "react";
import { Loader2, FlaskConical, Sparkles, Upload } from "lucide-react";
import { useTRPC } from "@/trpc/client";
import { buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

export default function TestsPage() {
  const { isSignedIn, isLoaded } = useAuth();
  const trpc = useTRPC();
  const qc = useQueryClient();
  const [docId, setDocId] = useState("");
  const [title, setTitle] = useState("");
  const [err, setErr] = useState<string | null>(null);

  // AI generation form
  const [genTitle, setGenTitle] = useState("Adaptive practice paper");
  const [genCount, setGenCount] = useState(15);
  const [genDuration, setGenDuration] = useState(60);
  const [genDifficulty, setGenDifficulty] = useState<
    "easy" | "medium" | "hard" | "mixed"
  >("mixed");
  const [genMode, setGenMode] = useState<"auto" | "manual">("auto");
  const [selectedTopics, setSelectedTopics] = useState<string[]>([]);
  const [genErr, setGenErr] = useState<string | null>(null);

  const list = useQuery({
    ...trpc.tests.list.queryOptions(),
    enabled: isLoaded && !!isSignedIn,
    refetchInterval: 5000,
  });

  const docs = useQuery({
    ...trpc.documents.list.queryOptions(),
    enabled: isLoaded && !!isSignedIn,
  });

  const genTopicsOpts = trpc.tests.generationTopics.queryOptions();
  const genTopics = useQuery({
    queryKey: genTopicsOpts.queryKey,
    queryFn: genTopicsOpts.queryFn,
    enabled: isLoaded && !!isSignedIn,
  });

  const createFromPaperOpts = trpc.tests.createFromPaper.mutationOptions();
  const create = useMutation({
    mutationFn: createFromPaperOpts.mutationFn,
    onSuccess: () => {
      void qc.invalidateQueries(trpc.tests.list.queryFilter());
      setDocId("");
      setTitle("");
    },
    onError: (e: { message?: string }) => setErr(e.message ?? "Failed"),
  });

  const createGenOpts = trpc.tests.createGenerated.mutationOptions();
  const createGen = useMutation({
    mutationFn: createGenOpts.mutationFn,
    onSuccess: () => {
      void qc.invalidateQueries(trpc.tests.list.queryFilter());
      setGenErr(null);
    },
    onError: (e: { message?: string }) => setGenErr(e.message ?? "Failed"),
  });

  const syllabusTopics = genTopics.data?.syllabusTopics ?? [];
  const weakTopics = genTopics.data?.weakTopics ?? [];

  const topicOptions = useMemo(() => {
    return [...new Set([...weakTopics, ...syllabusTopics])];
  }, [weakTopics, syllabusTopics]);

  function toggleTopic(t: string) {
    setSelectedTopics((prev) =>
      prev.includes(t) ? prev.filter((x) => x !== t) : [...prev, t],
    );
  }

  return (
    <div className="mx-auto flex min-h-full w-full max-w-2xl flex-col gap-6 px-6 py-10">
      <header className="flex items-center justify-between">
        <div>
          <p className="text-sm font-medium text-[var(--eg-primary)]">ExamGPT</p>
          <h1 className="text-2xl font-semibold">Tests</h1>
        </div>
        <Link href="/dashboard" className={cn(buttonVariants({ variant: "outline" }))}>
          Dashboard
        </Link>
      </header>

      <section className="rounded-xl border border-[var(--eg-border)] p-4">
        <h2 className="flex items-center gap-2 font-medium">
          <Upload className="size-4" /> Upload previous year paper
        </h2>
        <p className="mt-1 text-sm text-[var(--eg-muted-fg)]">
          Pick a document from your library (upload a PAPER PDF first in Library).
        </p>
        <div className="mt-3 flex flex-col gap-2">
          <select
            className="rounded-md border border-[var(--eg-border)] bg-transparent px-3 py-2 text-sm"
            value={docId}
            onChange={(e) => setDocId(e.target.value)}
          >
            <option value="">Select document…</option>
            {docs.data?.map((d) => (
              <option key={d.id} value={d.id}>
                {d.title} ({d.kind} · {d.ingestStatus})
              </option>
            ))}
          </select>
          <Input
            placeholder="Title (optional)"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
          />
          <button
            type="button"
            disabled={!docId || create.isPending}
            className={cn(buttonVariants(), "self-start gap-1")}
            onClick={() => {
              setErr(null);
              create.mutate({
                documentId: docId,
                title: title || undefined,
              });
            }}
          >
            {create.isPending ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <FlaskConical className="size-4" />
            )}
            Prepare paper
          </button>
          {err && <p className="text-sm text-red-600">{err}</p>}
        </div>
      </section>

      <section className="rounded-xl border border-[var(--eg-border)] p-4">
        <h2 className="flex items-center gap-2 font-medium">
          <Sparkles className="size-4 text-[var(--eg-primary)]" /> Generate a
          paper
        </h2>
        <p className="mt-1 text-sm text-[var(--eg-muted-fg)]">
          Adaptive practice: Auto mode weights weak topics (~50%) from your last
          reports and grounds questions in your notes.
        </p>
        <div className="mt-3 flex flex-col gap-3">
          <Input
            placeholder="Paper title"
            value={genTitle}
            onChange={(e) => setGenTitle(e.target.value)}
          />
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            <label className="text-xs text-[var(--eg-muted-fg)]">
              Questions
              <Input
                type="number"
                min={5}
                max={100}
                value={genCount}
                onChange={(e) => setGenCount(Number(e.target.value) || 15)}
                className="mt-1"
              />
            </label>
            <label className="text-xs text-[var(--eg-muted-fg)]">
              Duration (min)
              <Input
                type="number"
                min={15}
                max={600}
                value={genDuration}
                onChange={(e) => setGenDuration(Number(e.target.value) || 60)}
                className="mt-1"
              />
            </label>
            <label className="text-xs text-[var(--eg-muted-fg)]">
              Difficulty
              <select
                className="mt-1 w-full rounded-md border border-[var(--eg-border)] bg-transparent px-3 py-2 text-sm"
                value={genDifficulty}
                onChange={(e) =>
                  setGenDifficulty(
                    e.target.value as "easy" | "medium" | "hard" | "mixed",
                  )
                }
              >
                <option value="mixed">Mixed</option>
                <option value="easy">Easy</option>
                <option value="medium">Medium</option>
                <option value="hard">Hard</option>
              </select>
            </label>
          </div>

          <div className="flex gap-2">
            <button
              type="button"
              className={cn(
                "rounded-full px-3 py-1 text-xs",
                genMode === "auto"
                  ? "bg-[var(--eg-primary)] text-white"
                  : "border border-[var(--eg-border)]",
              )}
              onClick={() => setGenMode("auto")}
            >
              Auto (weak topics)
            </button>
            <button
              type="button"
              className={cn(
                "rounded-full px-3 py-1 text-xs",
                genMode === "manual"
                  ? "bg-[var(--eg-primary)] text-white"
                  : "border border-[var(--eg-border)]",
              )}
              onClick={() => setGenMode("manual")}
            >
              Manual topics
            </button>
          </div>

          {weakTopics.length > 0 && genMode === "auto" && (
            <p className="text-xs text-amber-700 dark:text-amber-400">
              Weak from reports: {weakTopics.slice(0, 6).join(", ")}
              {weakTopics.length > 6 ? "…" : ""}
            </p>
          )}

          {genMode === "manual" && (
            <div className="max-h-40 overflow-y-auto rounded-lg border border-[var(--eg-border)] p-2">
              {topicOptions.length === 0 ? (
                <p className="text-xs text-[var(--eg-muted-fg)]">
                  No syllabus topics yet — complete onboarding (NEET/JEE seeds
                  topics automatically).
                </p>
              ) : (
                <ul className="flex flex-wrap gap-1.5">
                  {topicOptions.map((t) => {
                    const on = selectedTopics.includes(t);
                    return (
                      <li key={t}>
                        <button
                          type="button"
                          onClick={() => toggleTopic(t)}
                          className={cn(
                            "rounded-full px-2 py-0.5 text-xs",
                            on
                              ? "bg-[var(--eg-primary)] text-white"
                              : "border border-[var(--eg-border)] text-[var(--eg-muted-fg)]",
                          )}
                        >
                          {t}
                        </button>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
          )}

          <button
            type="button"
            disabled={
              !genTitle.trim() ||
              createGen.isPending ||
              (genMode === "manual" && selectedTopics.length === 0)
            }
            className={cn(buttonVariants(), "self-start gap-1")}
            onClick={() => {
              setGenErr(null);
              createGen.mutate({
                title: genTitle.trim(),
                questionCount: genCount,
                durationMin: genDuration,
                difficulty: genDifficulty,
                mode: genMode,
                topics: genMode === "manual" ? selectedTopics : undefined,
              });
            }}
          >
            {createGen.isPending ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <Sparkles className="size-4" />
            )}
            Generate paper
          </button>
          {genErr && <p className="text-sm text-red-600">{genErr}</p>}
          {createGen.isSuccess && (
            <p className="text-sm text-green-700">
              Generation started — open the test below when status is READY.
            </p>
          )}
        </div>
      </section>

      <ul className="flex flex-col gap-2">
        {list.data?.map((t) => (
          <li key={t.id}>
            <Link
              href={`/tests/${t.id}`}
              className="block rounded-xl border border-[var(--eg-border)] px-4 py-3 hover:border-[var(--eg-primary)]"
            >
              <div className="flex items-center justify-between gap-2">
                <p className="font-medium">{t.title}</p>
                <span className="text-xs font-medium uppercase text-[var(--eg-muted-fg)]">
                  {t.status}
                </span>
              </div>
              <p className="mt-1 text-sm text-[var(--eg-muted-fg)]">
                {t.source === "AI_GENERATED" ? "AI · " : "PYQ · "}
                {t._count.questions} questions · {t.durationMin} min
                {t.syllabusMatchScore != null
                  ? ` · match ${Math.round(t.syllabusMatchScore * 100)}%`
                  : ""}
              </p>
              {t.failureReason && (
                <p className="mt-1 text-xs text-amber-700">{t.failureReason}</p>
              )}
            </Link>
          </li>
        ))}
        {list.data?.length === 0 && (
          <p className="text-sm text-[var(--eg-muted-fg)]">No tests yet.</p>
        )}
      </ul>
    </div>
  );
}
