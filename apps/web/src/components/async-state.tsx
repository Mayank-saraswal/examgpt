"use client";

import type { ReactNode } from "react";
import { AlertCircle, Inbox, Loader2, RefreshCw } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/** Phase 7 — consistent loading / empty / error + retry across screens. */
export function LoadingState({
  label = "Loading…",
  className,
}: {
  label?: string;
  className?: string;
}) {
  return (
    <div
      role="status"
      aria-live="polite"
      className={cn(
        "flex flex-col items-center justify-center gap-3 rounded-xl border border-dashed border-[var(--eg-border)] p-10 text-center",
        className,
      )}
    >
      <Loader2
        className="size-8 animate-spin text-[var(--eg-primary)]"
        aria-hidden
      />
      <p className="text-sm text-[var(--eg-muted-fg)]">{label}</p>
    </div>
  );
}

export function EmptyState({
  title,
  description,
  action,
  className,
}: {
  title: string;
  description?: string;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div
      role="status"
      className={cn(
        "flex flex-col items-center justify-center gap-3 rounded-xl border border-dashed border-[var(--eg-border)] p-10 text-center",
        className,
      )}
    >
      <div className="flex size-12 items-center justify-center rounded-full bg-[var(--eg-muted)]">
        <Inbox className="size-6 text-[var(--eg-muted-fg)]" aria-hidden />
      </div>
      <div>
        <p className="font-medium">{title}</p>
        {description && (
          <p className="mt-1 max-w-sm text-sm text-[var(--eg-muted-fg)]">
            {description}
          </p>
        )}
      </div>
      {action}
    </div>
  );
}

export function ErrorState({
  title = "Something went wrong",
  description,
  onRetry,
  retryLabel = "Retry",
  className,
}: {
  title?: string;
  description?: string;
  onRetry?: () => void;
  retryLabel?: string;
  className?: string;
}) {
  return (
    <div
      role="alert"
      className={cn(
        "flex flex-col items-center justify-center gap-3 rounded-xl border border-[var(--eg-error)]/30 bg-red-50 p-10 text-center dark:bg-red-950/30",
        className,
      )}
    >
      <AlertCircle className="size-8 text-[var(--eg-error)]" aria-hidden />
      <div>
        <p className="font-medium text-[var(--eg-error)]">{title}</p>
        {description && (
          <p className="mt-1 max-w-sm text-sm text-[var(--eg-muted-fg)]">
            {description}
          </p>
        )}
      </div>
      {onRetry && (
        <button
          type="button"
          onClick={onRetry}
          className={cn(buttonVariants({ variant: "outline" }), "gap-1.5")}
        >
          <RefreshCw className="size-4" aria-hidden />
          {retryLabel}
        </button>
      )}
    </div>
  );
}
