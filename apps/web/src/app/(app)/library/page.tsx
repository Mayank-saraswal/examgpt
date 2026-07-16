"use client";

import { useAuth } from "@clerk/nextjs";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { useCallback, useRef, useState } from "react";
import { FileUp, Loader2, RefreshCw, AlertCircle, BookOpen } from "lucide-react";
import { useTRPC } from "@/trpc/client";
import { buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

function statusLabel(doc: {
  ingestStatus: string;
  ingestProgress: number;
  pageCount: number | null;
  pages?: { ocrStatus: string }[];
  failureReason: string | null;
}) {
  if (doc.ingestStatus === "READY") return "Ready";
  if (doc.ingestStatus === "FAILED")
    return `Failed${doc.failureReason ? `: ${doc.failureReason}` : ""}`;
  if (doc.ingestStatus === "PROCESSING") {
    const done = doc.pages?.filter((p) => p.ocrStatus === "READY").length ?? 0;
    const total = doc.pageCount ?? "?";
    return `Processing ${done}/${total} pages (${doc.ingestProgress}%)`;
  }
  return "Uploading / queued";
}

export default function LibraryPage() {
  const { isSignedIn, isLoaded } = useAuth();
  const trpc = useTRPC();
  const qc = useQueryClient();
  const fileRef = useRef<HTMLInputElement>(null);
  const [url, setUrl] = useState("");
  const [title, setTitle] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);

  const list = useQuery({
    ...trpc.documents.list.queryOptions(),
    enabled: isLoaded && !!isSignedIn,
    refetchInterval: (q) => {
      const data = q.state.data;
      if (!data) return false;
      const busy = data.some(
        (d) => d.ingestStatus === "PENDING" || d.ingestStatus === "PROCESSING",
      );
      return busy ? 2500 : false;
    },
  });

  const presign = useMutation(trpc.documents.presignUpload.mutationOptions());
  const register = useMutation(trpc.documents.registerUpload.mutationOptions());
  const addByUrl = useMutation(trpc.documents.addByUrl.mutationOptions());
  const retry = useMutation(
    trpc.documents.retryIngest.mutationOptions({
      onSuccess: () => qc.invalidateQueries(trpc.documents.list.queryFilter()),
    }),
  );
  const del = useMutation(
    trpc.documents.delete.mutationOptions({
      onSuccess: () => qc.invalidateQueries(trpc.documents.list.queryFilter()),
    }),
  );

  const onFiles = useCallback(
    async (files: FileList | null) => {
      if (!files?.length) return;
      setError(null);
      setUploading(true);
      try {
        for (const file of Array.from(files)) {
          const isPdf = file.type === "application/pdf";
          const sourceType = isPdf ? "UPLOAD_PDF" : "UPLOAD_IMAGE";
          const mimeType = file.type || (isPdf ? "application/pdf" : "image/jpeg");
          const { documentId, uploadUrl } = await presign.mutateAsync({
            kind: "NOTES",
            title: title || file.name,
            mimeType,
            sizeBytes: file.size,
            sourceType,
          });
          const put = await fetch(uploadUrl, {
            method: "PUT",
            headers: { "Content-Type": mimeType },
            body: file,
          });
          if (!put.ok) throw new Error(`Upload failed (${put.status})`);
          const buf = await file.arrayBuffer();
          const hashBuffer = await crypto.subtle.digest("SHA-256", buf);
          const hash = Array.from(new Uint8Array(hashBuffer))
            .map((b) => b.toString(16).padStart(2, "0"))
            .join("");
          await register.mutateAsync({ documentId, contentHash: hash });
        }
        await qc.invalidateQueries(trpc.documents.list.queryFilter());
        setTitle("");
      } catch (e) {
        setError(e instanceof Error ? e.message : "Upload failed");
      } finally {
        setUploading(false);
        if (fileRef.current) fileRef.current.value = "";
      }
    },
    [presign, register, qc, trpc, title],
  );

  async function onUrlSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    try {
      await addByUrl.mutateAsync({
        url: url.trim(),
        title: title || "PDF from URL",
        kind: "NOTES",
      });
      setUrl("");
      await qc.invalidateQueries(trpc.documents.list.queryFilter());
    } catch (err) {
      setError(err instanceof Error ? err.message : "URL add failed");
    }
  }

  if (!isLoaded) {
    return (
      <div className="flex items-center gap-2 p-8 text-sm text-[var(--eg-muted-fg)]">
        <Loader2 className="size-4 animate-spin" /> Loading…
      </div>
    );
  }
  if (!isSignedIn) {
    return (
      <div className="p-8">
        <p className="text-sm text-[var(--eg-muted-fg)]">
          Sign in to manage your library.
        </p>
        <Link href="/sign-in" className={cn(buttonVariants(), "mt-4")}>
          Sign in
        </Link>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-3xl space-y-8 px-6 py-10">
      <header className="flex items-start justify-between gap-4">
        <div>
          <p className="text-sm font-medium text-[var(--eg-primary)]">ExamGPT</p>
          <h1 className="text-2xl font-semibold tracking-tight">Library</h1>
          <p className="mt-1 text-sm text-[var(--eg-muted-fg)]">
            Upload notes and books. Processing runs in the background.
          </p>
        </div>
        <Link href="/dashboard" className={cn(buttonVariants({ variant: "outline" }))}>
          Dashboard
        </Link>
      </header>

      <section className="space-y-4 rounded-xl border border-[var(--eg-border)] p-5">
        <h2 className="text-sm font-semibold">Upload</h2>
        <div className="space-y-2">
          <Label htmlFor="title">Title (optional)</Label>
          <Input
            id="title"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Class 12 Physics notes"
          />
        </div>
        <div className="flex flex-wrap gap-3">
          <input
            ref={fileRef}
            type="file"
            accept="application/pdf,image/*"
            multiple
            className="hidden"
            onChange={(e) => void onFiles(e.target.files)}
          />
          <button
            type="button"
            disabled={uploading}
            className={cn(buttonVariants())}
            onClick={() => fileRef.current?.click()}
          >
            {uploading ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <FileUp className="size-4" />
            )}
            <span className="ml-2">Choose PDF / images</span>
          </button>
        </div>
        <form onSubmit={onUrlSubmit} className="flex flex-col gap-2 sm:flex-row">
          <Input
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="https://example.com/notes.pdf"
            className="flex-1"
          />
          <button
            type="submit"
            className={cn(buttonVariants({ variant: "outline" }))}
            disabled={addByUrl.isPending}
          >
            Add by URL
          </button>
        </form>
        {error && (
          <p className="flex items-start gap-2 text-sm text-[var(--eg-error)]" role="alert">
            <AlertCircle className="mt-0.5 size-4 shrink-0" />
            {error}
          </p>
        )}
      </section>

      <section className="space-y-3">
        <h2 className="text-sm font-semibold">Your documents</h2>
        {list.isLoading && (
          <div className="flex items-center gap-2 text-sm text-[var(--eg-muted-fg)]">
            <Loader2 className="size-4 animate-spin" /> Loading library…
          </div>
        )}
        {list.isError && (
          <div className="rounded-lg border border-[var(--eg-error)]/30 p-4 text-sm">
            <p className="text-[var(--eg-error)]">{list.error.message}</p>
            <button
              type="button"
              className={cn(buttonVariants({ variant: "outline", size: "sm" }), "mt-2")}
              onClick={() => void list.refetch()}
            >
              Retry
            </button>
          </div>
        )}
        {list.data?.length === 0 && (
          <div className="rounded-xl border border-dashed border-[var(--eg-border)] p-10 text-center">
            <BookOpen className="mx-auto size-8 text-[var(--eg-muted-fg)]" />
            <p className="mt-3 text-sm text-[var(--eg-muted-fg)]">
              No documents yet. Upload a PDF to start building your notes library.
            </p>
          </div>
        )}
        <ul className="space-y-2">
          {list.data?.map((doc) => (
            <li
              key={doc.id}
              className="flex flex-col gap-2 rounded-xl border border-[var(--eg-border)] p-4 sm:flex-row sm:items-center sm:justify-between"
            >
              <div className="min-w-0">
                <p className="truncate font-medium">{doc.title}</p>
                <p className="mt-1 text-xs text-[var(--eg-muted-fg)]">
                  {doc.kind} · {statusLabel(doc)}
                </p>
                {(doc.ingestStatus === "PROCESSING" ||
                  doc.ingestStatus === "PENDING") && (
                  <div className="mt-2 h-1.5 w-full max-w-xs overflow-hidden rounded-full bg-[var(--eg-muted)]">
                    <div
                      className="h-full rounded-full bg-[var(--eg-primary)] transition-all"
                      style={{ width: `${Math.max(doc.ingestProgress, 4)}%` }}
                    />
                  </div>
                )}
              </div>
              <div className="flex flex-wrap gap-2">
                {doc.ingestStatus === "READY" && (
                  <Link
                    href={`/library/${doc.id}?page=1`}
                    className={cn(buttonVariants({ size: "sm" }))}
                  >
                    Open
                  </Link>
                )}
                {doc.ingestStatus === "FAILED" && (
                  <button
                    type="button"
                    className={cn(buttonVariants({ variant: "outline", size: "sm" }))}
                    onClick={() => retry.mutate({ id: doc.id })}
                  >
                    <RefreshCw className="size-3.5" />
                    <span className="ml-1">Retry</span>
                  </button>
                )}
                <button
                  type="button"
                  className={cn(buttonVariants({ variant: "ghost", size: "sm" }))}
                  onClick={() => del.mutate({ id: doc.id })}
                >
                  Delete
                </button>
              </div>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
