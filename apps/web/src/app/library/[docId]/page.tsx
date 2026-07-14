"use client";

import { useAuth } from "@clerk/nextjs";
import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { useParams, useSearchParams } from "next/navigation";
import { useMemo, useState } from "react";
import { Document, Page, pdfjs } from "react-pdf";
import { ChevronLeft, ChevronRight, Loader2 } from "lucide-react";
import { useTRPC } from "@/trpc/client";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import "react-pdf/dist/Page/AnnotationLayer.css";
import "react-pdf/dist/Page/TextLayer.css";

pdfjs.GlobalWorkerOptions.workerSrc = new URL(
  "pdfjs-dist/build/pdf.worker.min.mjs",
  import.meta.url,
).toString();

export default function LibraryViewerPage() {
  const { docId } = useParams<{ docId: string }>();
  const search = useSearchParams();
  const initialPage = Math.max(1, Number(search.get("page") ?? "1") || 1);
  const [page, setPage] = useState(initialPage);
  const [numPages, setNumPages] = useState<number | null>(null);
  const { isSignedIn, isLoaded } = useAuth();
  const trpc = useTRPC();

  const file = useQuery({
    ...trpc.documents.getFileUrl.queryOptions({ id: docId }),
    enabled: isLoaded && !!isSignedIn && !!docId,
  });

  const meta = useQuery({
    ...trpc.documents.get.queryOptions({ id: docId }),
    enabled: isLoaded && !!isSignedIn && !!docId,
  });

  const fileUrl = file.data?.url;
  const options = useMemo(() => ({ withCredentials: false }), []);

  if (!isLoaded) {
    return (
      <div className="flex items-center gap-2 p-8 text-sm">
        <Loader2 className="size-4 animate-spin" /> Loading…
      </div>
    );
  }
  if (!isSignedIn) {
    return (
      <div className="p-8">
        <Link href="/sign-in" className={cn(buttonVariants())}>
          Sign in
        </Link>
      </div>
    );
  }

  return (
    <div className="flex min-h-full flex-col">
      <header className="flex flex-wrap items-center justify-between gap-3 border-b border-[var(--eg-border)] px-4 py-3">
        <div className="min-w-0">
          <Link
            href="/library"
            className="text-sm text-[var(--eg-primary)] hover:underline"
          >
            Library
          </Link>
          <h1 className="truncate text-lg font-semibold">
            {meta.data?.title ?? "Document"}
          </h1>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            className={cn(buttonVariants({ variant: "outline", size: "sm" }))}
            disabled={page <= 1}
            onClick={() => setPage((p) => Math.max(1, p - 1))}
          >
            <ChevronLeft className="size-4" />
          </button>
          <span className="text-sm tabular-nums">
            Page {page}
            {numPages ? ` / ${numPages}` : ""}
          </span>
          <button
            type="button"
            className={cn(buttonVariants({ variant: "outline", size: "sm" }))}
            disabled={numPages !== null && page >= numPages}
            onClick={() =>
              setPage((p) => (numPages ? Math.min(numPages, p + 1) : p + 1))
            }
          >
            <ChevronRight className="size-4" />
          </button>
        </div>
      </header>

      <main className="flex flex-1 justify-center overflow-auto bg-[var(--eg-muted)] p-4">
        {file.isLoading && (
          <div className="flex items-center gap-2 text-sm text-[var(--eg-muted-fg)]">
            <Loader2 className="size-4 animate-spin" /> Loading PDF…
          </div>
        )}
        {file.isError && (
          <div className="rounded-lg border border-[var(--eg-error)]/30 bg-white p-4 text-sm text-[var(--eg-error)]">
            {file.error.message}
          </div>
        )}
        {fileUrl && (
          <Document
            file={fileUrl}
            options={options}
            loading={
              <div className="flex items-center gap-2 text-sm">
                <Loader2 className="size-4 animate-spin" /> Rendering…
              </div>
            }
            onLoadSuccess={(pdf) => {
              setNumPages(pdf.numPages);
              setPage((p) => Math.min(Math.max(1, p), pdf.numPages));
            }}
            error={
              <p className="text-sm text-[var(--eg-error)]">
                Could not render PDF. Try re-uploading.
              </p>
            }
          >
            <Page
              pageNumber={page}
              width={Math.min(
                800,
                typeof window !== "undefined" ? window.innerWidth - 48 : 800,
              )}
              renderTextLayer
              renderAnnotationLayer
            />
          </Document>
        )}
      </main>
    </div>
  );
}
