"use client";

import { useAuth } from "@clerk/nextjs";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useParams, useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ChevronLeft,
  ChevronRight,
  Loader2,
  Flag,
  Eraser,
} from "lucide-react";
import { useTRPC } from "@/trpc/client";
import { buttonVariants } from "@/components/ui/button";
import { ChatMarkdown } from "@/components/chat-markdown";
import { cn } from "@/lib/utils";
import {
  clearQueuedEvents,
  enqueueEvent,
  loadQueuedEvents,
  newBatchId,
  saveQueuedEvents,
  type QueuedEvent,
} from "@/lib/attempt-events";
import type { EventType, PaletteState, QuestionRuntimeState } from "@examgpt/ai";

const PALETTE_STYLES: Record<
  PaletteState,
  string
> = {
  NOT_VISITED: "border-2 border-slate-400 bg-transparent text-slate-700",
  NOT_ANSWERED: "border-2 border-red-500 bg-red-50 text-red-800 dark:bg-red-950",
  ANSWERED: "border-2 border-green-600 bg-green-50 text-green-900 dark:bg-green-950",
  MARKED: "border-2 border-amber-500 bg-amber-50 text-amber-900 dark:bg-amber-950",
  ANSWERED_MARKED:
    "border-2 border-amber-500 bg-amber-50 text-amber-900 relative dark:bg-amber-950",
};

function formatMs(ms: number) {
  const s = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  return h > 0
    ? `${h}:${String(m).padStart(2, "0")}:${String(sec).padStart(2, "0")}`
    : `${m}:${String(sec).padStart(2, "0")}`;
}

export default function ExamPage() {
  const { attemptId } = useParams<{ attemptId: string }>();
  const { isSignedIn, isLoaded } = useAuth();
  const trpc = useTRPC();
  const router = useRouter();

  const [started, setStarted] = useState(false);
  const [idx, setIdx] = useState(1);
  const [confirmSubmit, setConfirmSubmit] = useState(false);
  const [remainingMs, setRemainingMs] = useState(0);
  /** Optimistic palette overrides (keyed by question index). */
  const [paletteDelta, setPaletteDelta] = useState<
    Record<number, QuestionRuntimeState>
  >({});
  const flushTimer = useRef<ReturnType<typeof setInterval> | null>(null);

  const state = useQuery({
    ...trpc.attempts.state.queryOptions({ attemptId }),
    enabled: isLoaded && !!isSignedIn && !!attemptId,
  });

  const serverTime = useQuery({
    ...trpc.attempts.serverTime.queryOptions(),
    enabled: started,
    refetchInterval: 60_000,
  });

  const offsetMs = useMemo(() => {
    const sn =
      serverTime.data?.serverNow ?? state.data?.serverNow ?? null;
    if (!sn) return 0;
    return new Date(sn).getTime() - Date.now();
  }, [serverTime.data?.serverNow, state.data?.serverNow]);

  const serverPalette = useMemo(() => {
    if (!state.data?.palette) return {} as Record<number, QuestionRuntimeState>;
    return JSON.parse(JSON.stringify(state.data.palette)) as Record<
      number,
      QuestionRuntimeState
    >;
  }, [state.data?.palette]);

  const localPalette = useMemo(
    () => ({ ...serverPalette, ...paletteDelta }),
    [serverPalette, paletteDelta],
  );

  // countdown from endsAt + offset (setState only from interval tick)
  useEffect(() => {
    if (!started || !state.data) return;
    const ends = new Date(state.data.attempt.endsAt).getTime();
    const tick = () => {
      const serverApprox = Date.now() + offsetMs;
      setRemainingMs(Math.max(0, ends - serverApprox));
    };
    const id = setInterval(tick, 250);
    return () => clearInterval(id);
  }, [started, state.data, offsetMs]);

  const ingest = useMutation(trpc.attempts.ingestEvents.mutationOptions());
  const submit = useMutation(
    trpc.attempts.submit.mutationOptions({
      onSuccess: () => {
        clearQueuedEvents(attemptId);
        router.push(`/exam/${attemptId}/done`);
      },
    }),
  );

  const flush = useCallback(async () => {
    const queued = loadQueuedEvents(attemptId);
    if (queued.length === 0) return;
    const batchId = newBatchId();
    const batch = [...queued];
    saveQueuedEvents(attemptId, []);
    try {
      await ingest.mutateAsync({
        attemptId,
        batchId,
        events: batch.map((e) => ({
          questionIndex: e.questionIndex,
          type: e.type,
          optionKey: e.optionKey,
          clientTs: new Date(e.clientTs),
        })),
      });
    } catch {
      // re-queue
      saveQueuedEvents(attemptId, [...batch, ...loadQueuedEvents(attemptId)]);
    }
  }, [attemptId, ingest]);

  useEffect(() => {
    if (!started) return;
    flushTimer.current = setInterval(() => void flush(), 10_000);
    const onBlur = () => {
      pushEvent(idx, "APP_BACKGROUND");
      void flush();
    };
    const onFocus = () => pushEvent(idx, "APP_FOREGROUND");
    window.addEventListener("blur", onBlur);
    window.addEventListener("focus", onFocus);
    return () => {
      if (flushTimer.current) clearInterval(flushTimer.current);
      window.removeEventListener("blur", onBlur);
      window.removeEventListener("focus", onFocus);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [started, flush, idx]);

  // auto-submit at 0
  useEffect(() => {
    if (started && remainingMs <= 0 && state.data?.attempt.status === "IN_PROGRESS") {
      void flush().then(() =>
        submit.mutate({ attemptId, autoTimeout: true }),
      );
    }
  }, [remainingMs, started, attemptId, flush, submit, state.data?.attempt.status]);

  type Q = {
    index: number;
    section: string | null;
    text: string;
    options: unknown;
    imageKeys: string[];
    flagged: boolean;
  };
  const questions: Q[] = useMemo(() => {
    if (!state.data?.test.questions) return [];
    return JSON.parse(JSON.stringify(state.data.test.questions)) as Q[];
  }, [state.data?.test.questions]);
  const sections = useMemo(() => {
    const s = new Set(questions.map((q) => q.section).filter(Boolean) as string[]);
    return [...s];
  }, [questions]);

  const current = questions.find((q) => q.index === idx) ?? questions[0];
  const options = (Array.isArray(current?.options)
    ? current!.options
    : []) as { key: string; text: string }[];

  function pushEvent(
    questionIndex: number,
    type: EventType,
    optionKey?: string | null,
  ) {
    const e: QueuedEvent = {
      questionIndex,
      type,
      optionKey,
      clientTs: new Date().toISOString(),
    };
    enqueueEvent(attemptId, e);

    // optimistic palette delta
    setPaletteDelta((prev) => {
      const base = localPalette[questionIndex] ?? {
        questionIndex,
        paletteState: "NOT_VISITED" as PaletteState,
        selectedKey: null,
        marked: false,
        visited: false,
        timeSpentSec: 0,
        visitCount: 0,
        optionChanges: 0,
      };
      const next = { ...base };
      if (type === "VISIT") {
        next.visited = true;
        next.visitCount += 1;
      }
      if (type === "SELECT" || type === "CHANGE") {
        next.visited = true;
        if (next.selectedKey && optionKey && next.selectedKey !== optionKey) {
          next.optionChanges += 1;
        }
        next.selectedKey = optionKey ?? next.selectedKey;
      }
      if (type === "CLEAR") next.selectedKey = null;
      if (type === "MARK_REVIEW") {
        next.marked = true;
        next.visited = true;
      }
      if (type === "UNMARK_REVIEW") next.marked = false;

      if (next.selectedKey && next.marked) next.paletteState = "ANSWERED_MARKED";
      else if (next.selectedKey) next.paletteState = "ANSWERED";
      else if (next.marked) next.paletteState = "MARKED";
      else if (next.visited) next.paletteState = "NOT_ANSWERED";
      else next.paletteState = "NOT_VISITED";

      return { ...prev, [questionIndex]: next };
    });
  }

  function goTo(n: number) {
    if (!current) return;
    pushEvent(idx, "LEAVE");
    setIdx(n);
    pushEvent(n, "VISIT");
  }

  if (!isLoaded || state.isLoading) {
    return (
      <div className="flex min-h-dvh items-center justify-center">
        <Loader2 className="size-8 animate-spin text-[var(--eg-primary)]" />
      </div>
    );
  }

  if (!state.data) {
    return <p className="p-8 text-sm text-red-600">Attempt not found</p>;
  }

  if (!started) {
    return (
      <div className="mx-auto max-w-2xl px-4 py-10">
        <h1 className="text-2xl font-semibold">Instructions</h1>
        <p className="mt-2 text-sm text-[var(--eg-muted-fg)]">
          {state.data.test.title} · {state.data.test.durationMin} minutes ·{" "}
          {questions.length} questions
        </p>
        <ul className="mt-6 space-y-2 text-sm">
          <li>Timer is controlled by the server. Do not rely on device clock.</li>
          <li>Palette legend:</li>
        </ul>
        <div className="mt-3 flex flex-wrap gap-2 text-xs">
          {(
            [
              ["NOT_VISITED", "Not visited"],
              ["NOT_ANSWERED", "Not answered"],
              ["ANSWERED", "Answered"],
              ["MARKED", "Marked for review"],
              ["ANSWERED_MARKED", "Answered & marked"],
            ] as const
          ).map(([k, label]) => (
            <span
              key={k}
              className={cn(
                "inline-flex items-center gap-1 rounded px-2 py-1",
                PALETTE_STYLES[k],
              )}
            >
              <span className="inline-block size-4 rounded-sm border" />
              {label}
              {k === "ANSWERED_MARKED" && (
                <span className="size-1.5 rounded-full bg-green-600" />
              )}
            </span>
          ))}
        </div>
        <p className="mt-4 text-sm text-[var(--eg-muted-fg)]">
          Answered &amp; Marked for Review counts as answered at submit (NTA).
        </p>
        <button
          type="button"
          className={cn(buttonVariants({ size: "lg" }), "mt-8")}
          onClick={() => {
            setStarted(true);
            const first = questions[0]?.index ?? 1;
            setIdx(first);
            pushEvent(first, "VISIT");
          }}
        >
          START TEST
        </button>
      </div>
    );
  }

  const counts = questions.reduce(
    (acc, q) => {
      const p = localPalette[q.index]?.paletteState ?? "NOT_VISITED";
      acc[p] = (acc[p] ?? 0) + 1;
      return acc;
    },
    {} as Record<string, number>,
  );

  return (
    <div className="flex min-h-dvh flex-col bg-[var(--eg-bg)] lg:flex-row">
      <div className="flex flex-1 flex-col">
        <header className="flex items-center justify-between border-b border-[var(--eg-border)] px-4 py-2">
          <p className="truncate text-sm font-medium">{state.data.test.title}</p>
          <p
            role="timer"
            aria-live="polite"
            aria-label={`Time remaining ${formatMs(remainingMs)}`}
            className={cn(
              "min-h-11 min-w-11 font-mono text-lg font-semibold tabular-nums",
              remainingMs < 60_000 ? "text-red-600" : "text-[var(--eg-fg)]",
            )}
          >
            {formatMs(remainingMs)}
          </p>
        </header>

        {sections.length > 0 && (
          <div className="flex gap-1 overflow-x-auto border-b border-[var(--eg-border)] px-2 py-1">
            {sections.map((sec) => (
              <button
                key={sec}
                type="button"
                className="rounded px-2 py-1 text-xs font-medium hover:bg-slate-100 dark:hover:bg-slate-900"
                onClick={() => {
                  const q = questions.find((x) => x.section === sec);
                  if (q) goTo(q.index);
                }}
              >
                {sec}
              </button>
            ))}
          </div>
        )}

        <main className="flex-1 overflow-y-auto p-4">
          {current && (
            <>
              <p className="text-sm font-medium text-[var(--eg-muted-fg)]">
                Question {current.index}
                {current.section ? ` · ${current.section}` : ""}
                {current.flagged ? " · excluded from scoring" : ""}
              </p>
              <div className="mt-2">
                <ChatMarkdown content={current.text} />
              </div>
              <div className="mt-4 space-y-2">
                {options.map((o) => {
                  const selected =
                    localPalette[current.index]?.selectedKey === o.key;
                  return (
                    <label
                      key={o.key}
                      className={cn(
                        "flex cursor-pointer gap-3 rounded-lg border px-3 py-2 text-sm",
                        selected
                          ? "border-[var(--eg-primary)] bg-blue-50 dark:bg-blue-950"
                          : "border-[var(--eg-border)]",
                      )}
                    >
                      <input
                        type="radio"
                        name={`q-${current.index}`}
                        checked={!!selected}
                        onChange={() =>
                          pushEvent(
                            current.index,
                            selected ? "CHANGE" : "SELECT",
                            o.key,
                          )
                        }
                      />
                      <span className="font-medium">{o.key}.</span>
                      <span>{o.text}</span>
                    </label>
                  );
                })}
              </div>
            </>
          )}
        </main>

        <footer
          className="flex flex-wrap gap-2 border-t border-[var(--eg-border)] p-3"
          role="toolbar"
          aria-label="Exam navigation"
        >
          <button
            type="button"
            aria-label="Previous question"
            className={cn(
              buttonVariants({ variant: "outline", size: "sm" }),
              "min-h-11 min-w-11",
            )}
            disabled={idx <= 1}
            onClick={() => goTo(idx - 1)}
          >
            <ChevronLeft className="size-4" aria-hidden /> Prev
          </button>
          <button
            type="button"
            aria-label="Save answer and go to next question"
            className={cn(buttonVariants({ size: "sm" }), "min-h-11")}
            onClick={() => {
              pushEvent(idx, "SAVE_NEXT");
              const next = questions.find((q) => q.index > idx);
              if (next) goTo(next.index);
            }}
          >
            SAVE &amp; NEXT <ChevronRight className="size-4" aria-hidden />
          </button>
          <button
            type="button"
            aria-label="Clear selected option"
            className={cn(
              buttonVariants({ variant: "outline", size: "sm" }),
              "min-h-11",
            )}
            onClick={() => pushEvent(idx, "CLEAR")}
          >
            <Eraser className="size-4" aria-hidden /> CLEAR
          </button>
          <button
            type="button"
            aria-label="Save answer, mark for review, and go next"
            className={cn(
              buttonVariants({ variant: "outline", size: "sm" }),
              "min-h-11",
            )}
            onClick={() => {
              pushEvent(idx, "MARK_REVIEW");
              pushEvent(idx, "SAVE_NEXT");
              const next = questions.find((q) => q.index > idx);
              if (next) goTo(next.index);
            }}
          >
            <Flag className="size-4" aria-hidden /> SAVE &amp; MARK
          </button>
          <button
            type="button"
            aria-label="Mark for review and go next"
            className={cn(
              buttonVariants({ variant: "outline", size: "sm" }),
              "min-h-11",
            )}
            onClick={() => {
              pushEvent(idx, "MARK_REVIEW");
              const next = questions.find((q) => q.index > idx);
              if (next) goTo(next.index);
            }}
          >
            MARK &amp; NEXT
          </button>
          <button
            type="button"
            aria-label="Submit test"
            className={cn(
              buttonVariants({ variant: "destructive", size: "sm" }),
              "ml-auto min-h-11",
            )}
            onClick={() => setConfirmSubmit(true)}
          >
            Submit
          </button>
        </footer>
      </div>

      {/* Palette */}
      <aside
        className="border-t border-[var(--eg-border)] p-3 lg:w-64 lg:border-l lg:border-t-0"
        aria-label="Question palette"
      >
        <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-[var(--eg-muted-fg)]">
          Palette
        </p>
        <div className="grid grid-cols-5 gap-1.5" role="list">
          {questions.map((q) => {
            const st =
              localPalette[q.index]?.paletteState ?? ("NOT_VISITED" as PaletteState);
            return (
              <button
                key={q.index}
                type="button"
                role="listitem"
                aria-label={`Question ${q.index}, status ${st.replaceAll("_", " ").toLowerCase()}${q.index === idx ? ", current" : ""}`}
                aria-current={q.index === idx ? "true" : undefined}
                onClick={() => goTo(q.index)}
                className={cn(
                  "relative flex size-11 min-h-11 min-w-11 items-center justify-center rounded text-xs font-semibold",
                  PALETTE_STYLES[st],
                  q.index === idx && "ring-2 ring-[var(--eg-primary)]",
                )}
              >
                {q.index}
                {st === "ANSWERED_MARKED" && (
                  <span
                    className="absolute bottom-0.5 right-0.5 size-1.5 rounded-full bg-green-600"
                    aria-hidden
                  />
                )}
              </button>
            );
          })}
        </div>
        <ul className="mt-3 space-y-1 text-xs text-[var(--eg-muted-fg)]">
          <li>Not visited: {counts.NOT_VISITED ?? 0}</li>
          <li>Not answered: {counts.NOT_ANSWERED ?? 0}</li>
          <li>Answered: {counts.ANSWERED ?? 0}</li>
          <li>Marked: {counts.MARKED ?? 0}</li>
          <li>Answered &amp; marked: {counts.ANSWERED_MARKED ?? 0}</li>
        </ul>
      </aside>

      {confirmSubmit && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-md rounded-xl bg-[var(--eg-surface)] p-6 shadow-lg">
            <h2 className="text-lg font-semibold">Submit test?</h2>
            <ul className="mt-3 space-y-1 text-sm">
              <li>Answered: {(counts.ANSWERED ?? 0) + (counts.ANSWERED_MARKED ?? 0)}</li>
              <li>Not answered: {(counts.NOT_ANSWERED ?? 0) + (counts.NOT_VISITED ?? 0)}</li>
              <li>Marked for review: {(counts.MARKED ?? 0) + (counts.ANSWERED_MARKED ?? 0)}</li>
            </ul>
            <div className="mt-4 flex justify-end gap-2">
              <button
                type="button"
                className={cn(buttonVariants({ variant: "outline" }))}
                onClick={() => setConfirmSubmit(false)}
              >
                Cancel
              </button>
              <button
                type="button"
                className={cn(buttonVariants())}
                disabled={submit.isPending}
                onClick={() => {
                  void flush().then(() => submit.mutate({ attemptId }));
                }}
              >
                {submit.isPending ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : (
                  "Confirm submit"
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
