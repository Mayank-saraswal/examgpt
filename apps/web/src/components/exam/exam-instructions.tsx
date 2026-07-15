"use client";

import { paletteCellClass, PALETTE_LEGEND } from "./palette-styles";
import { cn } from "@/lib/utils";

type Props = {
  title: string;
  durationMin: number;
  questionCount: number;
  onStart: () => void;
};

export function ExamInstructions({
  title,
  durationMin,
  questionCount,
  onStart,
}: Props) {
  return (
    <div className="exam-portal mx-auto min-h-dvh max-w-3xl px-6 py-10">
      <p className="text-sm text-[var(--exam-muted-fg)]">
        {title} · {durationMin} min · {questionCount} questions
      </p>

      <section className="mt-8">
        <h2 className="text-lg font-semibold text-[var(--exam-heading)]">
          General Instructions
        </h2>
        <ol className="mt-3 list-decimal space-y-3 pl-5 text-sm leading-relaxed text-[var(--exam-fg)]">
          <li>
            The clock has been set on the{" "}
            <strong>server</strong> and a countdown timer will display the
            remaining time. When the clock runs out the exam ends by default —
            you are not required to end or submit manually.
          </li>
          <li>
            The questions palette on the right of the screen shows one of the
            following statuses for each numbered question:
            <ul className="mt-3 space-y-2">
              {PALETTE_LEGEND.map((item) => (
                <li key={item.state} className="flex items-center gap-3">
                  <span className={paletteCellClass(item.state)}>
                    15
                    {item.hasDot && (
                      <span
                        className="absolute bottom-0.5 right-0.5 size-2 rounded-full bg-[var(--exam-marked-dot)] ring-1 ring-white"
                        aria-hidden
                      />
                    )}
                  </span>
                  <span className="text-[var(--exam-fg)]">{item.label}</span>
                </li>
              ))}
            </ul>
            <p className="mt-3 text-[var(--exam-muted-fg)]">
              The Marked for Review status acts as a reminder to look at the
              question again. If an answer is selected for a question that is
              Marked for Review, the answer{" "}
              <strong className="text-[var(--exam-fg)]">will</strong> be
              considered in the final evaluation (NTA rule).
            </p>
          </li>
        </ol>
      </section>

      <section className="mt-8">
        <h2 className="text-lg font-semibold text-[var(--exam-heading)]">
          Navigation to a question
        </h2>
        <ol className="mt-3 list-decimal space-y-2 pl-5 text-sm leading-relaxed" start={3}>
          <li>
            Click a question number on the palette to jump directly. Note: this
            does <strong>not</strong> save your answer to the current question.
          </li>
          <li>
            Click <strong>ALL QUESTIONS</strong> to view the entire paper, or{" "}
            <strong>INSTRUCTIONS</strong> to re-read these rules.
          </li>
        </ol>
      </section>

      <section className="mt-8">
        <h2 className="text-lg font-semibold text-[var(--exam-heading)]">
          Answering questions
        </h2>
        <ol className="mt-3 list-decimal space-y-2 pl-5 text-sm leading-relaxed" start={5}>
          <li>
            For multiple-choice questions: select an option, change it by
            selecting another, deselect with <strong>CLEAR</strong>, mark with{" "}
            <strong>MARK FOR REVIEW &amp; NEXT</strong>, and save with{" "}
            <strong>SAVE &amp; NEXT</strong>.
          </li>
          <li>
            Questions that are saved or marked for review after answering will
            only be considered for evaluation.
          </li>
          <li>
            If the app is closed mid-attempt, you can resume with the same
            remaining server time and palette state.
          </li>
        </ol>
      </section>

      <section className="mt-8">
        <h2 className="text-lg font-semibold text-[var(--exam-heading)]">
          Navigation through sections
        </h2>
        <ol className="mt-3 list-decimal space-y-2 pl-5 text-sm leading-relaxed" start={9}>
          <li>
            Sections (when present) appear under the top bar. Click a section
            name to jump to its first question. The active section is
            highlighted.
          </li>
          <li>
            Hover a section tab (web) to see per-section palette counts.
          </li>
          <li>You can move between sections anytime during the exam.</li>
        </ol>
      </section>

      <div className="mt-12 flex justify-center">
        <button
          type="button"
          onClick={onStart}
          className={cn(
            "min-h-12 rounded-md px-12 text-sm font-semibold",
            "bg-[var(--exam-action)] text-[var(--exam-action-fg)]",
            "hover:brightness-95 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--exam-action)]",
          )}
        >
          START TEST
        </button>
      </div>
    </div>
  );
}
