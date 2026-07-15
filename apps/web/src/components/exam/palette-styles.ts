import type { PaletteState } from "@examgpt/ai";
import { cn } from "@/lib/utils";

/** NTA palette cell classes (exam.* tokens). Circle for all states except not-visited can be square-outline. */
export function paletteCellClass(state: PaletteState, opts?: { current?: boolean }) {
  const base =
    "relative flex size-9 min-h-9 min-w-9 items-center justify-center text-xs font-semibold transition-colors";
  const ring = opts?.current ? "ring-2 ring-[var(--exam-action)] ring-offset-1" : "";

  switch (state) {
    case "ANSWERED":
      return cn(base, ring, "rounded-full bg-[var(--exam-answered)] text-[var(--exam-answered-fg)]");
    case "NOT_ANSWERED":
      return cn(
        base,
        ring,
        "rounded-full bg-[var(--exam-not-answered)] text-[var(--exam-not-answered-fg)]",
      );
    case "MARKED":
      return cn(base, ring, "rounded-full bg-[var(--exam-marked)] text-[var(--exam-marked-fg)]");
    case "ANSWERED_MARKED":
      return cn(base, ring, "rounded-full bg-[var(--exam-marked)] text-[var(--exam-marked-fg)]");
    case "NOT_VISITED":
    default:
      return cn(
        base,
        ring,
        "rounded-full border-2 border-[var(--exam-not-visited-border)] bg-[var(--exam-not-visited)] text-[var(--exam-not-visited-fg)]",
      );
  }
}

export const PALETTE_LEGEND: {
  state: PaletteState;
  label: string;
  hasDot?: boolean;
}[] = [
  { state: "ANSWERED", label: "Answered" },
  { state: "NOT_ANSWERED", label: "Not answered" },
  { state: "MARKED", label: "Marked for review" },
  { state: "NOT_VISITED", label: "Not visited" },
  { state: "ANSWERED_MARKED", label: "Answered & marked for review", hasDot: true },
];
