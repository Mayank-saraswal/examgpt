"use client";

import Link from "next/link";
import { BookOpen, ExternalLink } from "lucide-react";

export type PillCitation = {
  documentId: string;
  title: string;
  pageNumber: number;
};

export type PillWebSource = {
  url: string;
  title: string;
};

export function CitationPills({
  citations,
  webSources,
}: {
  citations?: PillCitation[] | null;
  webSources?: PillWebSource[] | null;
}) {
  if ((!citations || citations.length === 0) && (!webSources || webSources.length === 0)) {
    return null;
  }

  return (
    <div className="mt-3 flex flex-wrap gap-2">
      {citations?.map((c) => (
        <Link
          key={`${c.documentId}-${c.pageNumber}`}
          href={`/library/${c.documentId}?page=${c.pageNumber}`}
          className="inline-flex items-center gap-1.5 rounded-full border border-[var(--eg-border)] bg-[var(--eg-surface)] px-2.5 py-1 text-xs font-medium text-[var(--eg-primary)] hover:bg-slate-50 dark:hover:bg-slate-900"
        >
          <BookOpen className="size-3.5" aria-hidden />
          {c.title}, p. {c.pageNumber}
        </Link>
      ))}
      {webSources?.map((w) => (
        <a
          key={w.url}
          href={w.url}
          target="_blank"
          rel="noreferrer"
          className="inline-flex items-center gap-1.5 rounded-full border border-amber-300 bg-amber-50 px-2.5 py-1 text-xs font-medium text-amber-900 dark:border-amber-700 dark:bg-amber-950 dark:text-amber-100"
        >
          <ExternalLink className="size-3.5" aria-hidden />
          Web: {w.title}
        </a>
      ))}
    </div>
  );
}
