"use client";

import Link from "next/link";
import { BookOpen, ExternalLink } from "lucide-react";
import { Marker, MarkerContent, MarkerIcon } from "@/components/ui/marker";

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
  if (
    (!citations || citations.length === 0) &&
    (!webSources || webSources.length === 0)
  ) {
    return null;
  }

  return (
    <div className="mt-2 flex flex-col gap-1.5">
      {citations?.map((c) => (
        <Marker key={`${c.documentId}-${c.pageNumber}`} className="w-auto">
          <MarkerIcon>
            <BookOpen className="size-3.5 text-[var(--eg-primary)]" />
          </MarkerIcon>
          <MarkerContent>
            <Link
              href={`/library/${c.documentId}?page=${c.pageNumber}`}
              className="font-medium text-[var(--eg-primary)] no-underline hover:underline"
            >
              {c.title}, p. {c.pageNumber}
            </Link>
          </MarkerContent>
        </Marker>
      ))}
      {webSources?.map((w) => (
        <Marker key={w.url} className="w-auto text-amber-800 dark:text-amber-200">
          <MarkerIcon>
            <ExternalLink className="size-3.5" />
          </MarkerIcon>
          <MarkerContent>
            <a
              href={w.url}
              target="_blank"
              rel="noreferrer"
              className="font-medium no-underline hover:underline"
            >
              From the web: {w.title}
            </a>
          </MarkerContent>
        </Marker>
      ))}
    </div>
  );
}
