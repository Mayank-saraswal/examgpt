"use client";

import { useState } from "react";
import Link from "next/link";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2, Upload, ExternalLink } from "lucide-react";
import { useTRPC } from "@/trpc/client";
import { buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  EmptyState,
  ErrorState,
  LoadingState,
} from "@/components/async-state";
import { cn } from "@/lib/utils";

export default function AdminPapersPage() {
  const trpc = useTRPC();
  const qc = useQueryClient();
  const [title, setTitle] = useState("");
  const [year, setYear] = useState(2024);
  const [examType, setExamType] = useState<"NEET" | "JEE" | "OTHER">("NEET");
  const [file, setFile] = useState<File | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [dedupe, setDedupe] = useState<{
    existingTestId: string;
    title: string;
  } | null>(null);
  const [busy, setBusy] = useState(false);

  const list = useQuery({
    ...trpc.admin.listPlatformPapers.queryOptions(),
    refetchInterval: 5000,
  });

  const presign = useMutation(trpc.documents.presignUpload.mutationOptions());
  const register = useMutation(trpc.documents.registerUpload.mutationOptions());
  const create = useMutation(trpc.admin.createPlatformPaper.mutationOptions());
  const publish = useMutation({
    ...trpc.admin.setPublished.mutationOptions(),
    onSuccess: () => {
      void qc.invalidateQueries(trpc.admin.listPlatformPapers.queryFilter());
    },
  });

  async function onUpload() {
    setErr(null);
    setDedupe(null);
    if (!file) {
      setErr("Choose a PDF first");
      return;
    }
    if (!title.trim()) {
      setErr("Title is required");
      return;
    }
    setBusy(true);
    try {
      const { documentId, uploadUrl } = await presign.mutateAsync({
        title: title.trim(),
        kind: "PAPER",
        sourceType: "UPLOAD_PDF",
        mimeType: "application/pdf",
        sizeBytes: file.size,
      });

      const put = await fetch(uploadUrl, {
        method: "PUT",
        headers: { "Content-Type": "application/pdf" },
        body: file,
      });
      if (!put.ok) throw new Error(`Upload failed (${put.status})`);

      const buf = await file.arrayBuffer();
      const hashBuf = await crypto.subtle.digest("SHA-256", buf);
      const contentHash = Array.from(new Uint8Array(hashBuf))
        .map((b) => b.toString(16).padStart(2, "0"))
        .join("");

      await register.mutateAsync({ documentId, contentHash });

      const result = await create.mutateAsync({
        documentId,
        title: title.trim(),
        examType,
        paperYear: year,
        contentHash,
      });

      if (result.dedupeWarning) {
        setDedupe({
          existingTestId: result.dedupeWarning.existingTestId,
          title: result.dedupeWarning.title,
        });
      } else {
        setTitle("");
        setFile(null);
        void qc.invalidateQueries(trpc.admin.listPlatformPapers.queryFilter());
      }
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Upload failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <section className="rounded-xl border border-[var(--eg-border)] p-4">
        <h2 className="flex items-center gap-2 font-medium">
          <Upload className="size-4" aria-hidden /> Upload platform PYQ
        </h2>
        <p className="mt-1 text-sm text-[var(--eg-muted-fg)]">
          Runs the same paper/extract pipeline (including diagram crops). Review
          flagged questions, then publish.
        </p>
        <div className="mt-3 flex flex-col gap-2">
          <Input
            placeholder="Title (e.g. NEET UG 2024 Paper)"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
          />
          <div className="grid grid-cols-2 gap-2">
            <label className="text-xs text-[var(--eg-muted-fg)]">
              Exam
              <select
                className="mt-1 w-full rounded-md border border-[var(--eg-border)] bg-transparent px-3 py-2 text-sm"
                value={examType}
                onChange={(e) =>
                  setExamType(e.target.value as "NEET" | "JEE" | "OTHER")
                }
              >
                <option value="NEET">NEET</option>
                <option value="JEE">JEE</option>
                <option value="OTHER">OTHER</option>
              </select>
            </label>
            <label className="text-xs text-[var(--eg-muted-fg)]">
              Year
              <Input
                type="number"
                className="mt-1"
                value={year}
                onChange={(e) => setYear(Number(e.target.value) || 2024)}
              />
            </label>
          </div>
          <input
            type="file"
            accept="application/pdf"
            onChange={(e) => setFile(e.target.files?.[0] ?? null)}
            className="text-sm"
          />
          <button
            type="button"
            disabled={busy}
            onClick={() => void onUpload()}
            className={cn(buttonVariants(), "inline-flex w-fit gap-2")}
          >
            {busy ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <Upload className="size-4" />
            )}
            Upload and extract
          </button>
          {err && <p className="text-sm text-red-600">{err}</p>}
          {dedupe && (
            <p className="rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-900 dark:bg-amber-950 dark:text-amber-100">
              This paper already exists in the platform bank.{" "}
              <Link
                href={`/admin/papers/${dedupe.existingTestId}`}
                className="font-medium underline"
              >
                Open {dedupe.title}
              </Link>
            </p>
          )}
        </div>
      </section>

      <section>
        <h2 className="mb-2 font-medium">Platform papers</h2>
        {list.isLoading && <LoadingState label="Loading papers…" />}
        {list.isError && <ErrorState title="Failed to load papers" />}
        {list.data && list.data.length === 0 && (
          <EmptyState
            title="No platform papers"
            description="Upload a previous-year PDF to start the extract pipeline."
          />
        )}
        {list.data && list.data.length > 0 && (
          <ul className="divide-y divide-[var(--eg-border)] rounded-xl border border-[var(--eg-border)]">
            {list.data.map((p) => (
              <li
                key={p.id}
                className="flex flex-wrap items-center justify-between gap-2 px-4 py-3"
              >
                <div>
                  <Link
                    href={`/admin/papers/${p.id}`}
                    className="font-medium hover:underline"
                  >
                    {p.title}
                  </Link>
                  <p className="text-xs text-[var(--eg-muted-fg)]">
                    {p.examType ?? "—"} · {p.paperYear ?? "—"} · {p.status}
                    {p.publishedAt ? " · published" : " · draft"} ·{" "}
                    {p._count.questions} Q
                  </p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <Link
                    href={`/admin/papers/${p.id}`}
                    className={cn(
                      buttonVariants({ variant: "outline", size: "sm" }),
                      "inline-flex gap-1",
                    )}
                  >
                    Review <ExternalLink className="size-3" />
                  </Link>
                  <button
                    type="button"
                    disabled={
                      publish.isPending ||
                      (p.status !== "READY" && !p.publishedAt)
                    }
                    className={cn(buttonVariants({ size: "sm" }))}
                    onClick={() =>
                      publish.mutate({
                        testId: p.id,
                        published: !p.publishedAt,
                      })
                    }
                  >
                    {p.publishedAt ? "Unpublish" : "Publish"}
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
