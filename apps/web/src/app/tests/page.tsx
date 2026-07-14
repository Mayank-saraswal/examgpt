"use client";

import { useAuth } from "@clerk/nextjs";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { useState } from "react";
import { Loader2, FlaskConical, Upload } from "lucide-react";
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

  const list = useQuery({
    ...trpc.tests.list.queryOptions(),
    enabled: isLoaded && !!isSignedIn,
    refetchInterval: 5000,
  });

  const docs = useQuery({
    ...trpc.documents.list.queryOptions(),
    enabled: isLoaded && !!isSignedIn,
  });

  const create = useMutation(
    trpc.tests.createFromPaper.mutationOptions({
      onSuccess: () => {
        void qc.invalidateQueries(trpc.tests.list.queryFilter());
        setDocId("");
        setTitle("");
      },
      onError: (e) => setErr(e.message),
    }),
  );

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

      <section className="rounded-xl border border-dashed border-[var(--eg-border)] p-4 opacity-80">
        <h2 className="font-medium">Generate a paper</h2>
        <p className="mt-1 text-sm text-[var(--eg-muted-fg)]">
          AI generation ships in Phase 6. Config UI is available but will not extract yet.
        </p>
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
