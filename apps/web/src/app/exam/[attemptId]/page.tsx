"use client";

import { useAuth, useUser } from "@clerk/nextjs";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useParams, useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ChevronLeft,
  ChevronRight,
  Loader2,
  Star,
  Trash2,
  X,
  PanelRightClose,
  PanelRightOpen,
} from "lucide-react";
import { useTRPC } from "@/trpc/client";
import { ChatMarkdown } from "@/components/chat-markdown";
import { ExamInstructions } from "@/components/exam/exam-instructions";
import { paletteCellClass, PALETTE_LEGEND } from "@/components/exam/palette-styles";
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

function formatMs(ms: number) {
  const s = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  return h > 0
    ? `${h}:${String(m).padStart(2, "0")}:${String(sec).padStart(2, "0")}`
    : `${m}:${String(sec).padStart(2, "0")}`;
}

function figureSrc(key: string) {
  const api = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";
  return `${api}/storage/local/${key
    .split("/")
    .map(encodeURIComponent)
    .join("/")}`;
}

export default function ExamPage() {
  const { attemptId } = useParams<{ attemptId: string }>();
  const { isSignedIn, isLoaded } = useAuth();
  const { user } = useUser();
  const trpc = useTRPC();
  const router = useRouter();

  const [started, setStarted] = useState(false);
  const [showInstructions, setShowInstructions] = useState(false);
  const [idx, setIdx] = useState(1);
  const [confirmSubmit, setConfirmSubmit] = useState(false);
  const [remainingMs, setRemainingMs] = useState(0);
  const [paletteOpen, setPaletteOpen] = useState(true);
  const [paletteDelta, setPaletteDelta] = useState<
    Record<number, QuestionRuntimeState>
  >({});
  const flushTimer = useRef<ReturnType<typeof setInterval> | null>(null);

  const candidateName =
    user?.fullName ||
    user?.firstName ||
    user?.primaryEmailAddress?.emailAddress ||
    "Candidate";
  const candidateInitial = candidateName.charAt(0).toUpperCase();

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
    const sn = serverTime.data?.serverNow ?? state.data?.serverNow ?? null;
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

  useEffect(() => {
    if (
      started &&
      remainingMs <= 0 &&
      state.data?.attempt.status === "IN_PROGRESS"
    ) {
      void flush().then(() => submit.mutate({ attemptId, autoTimeout: true }));
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
    const s = new Set(
      questions.map((q) => q.section).filter(Boolean) as string[],
    );
    return [...s];
  }, [questions]);

  const current = questions.find((q) => q.index === idx) ?? questions[0];
  const options = (
    Array.isArray(current?.options) ? current!.options : []
  ) as { key: string; text: string; imageKey?: string }[];

  const total = questions.length;
  const qPos = questions.findIndex((q) => q.index === idx) + 1 || 1;

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
    pushEvent(idx, "LEAVE");
    setIdx(n);
    pushEvent(n, "VISIT");
  }

  function sectionCounts(sec: string) {
    const qs = questions.filter((q) => q.section === sec);
    const acc: Record<string, number> = {};
    for (const q of qs) {
      const p = localPalette[q.index]?.paletteState ?? "NOT_VISITED";
      acc[p] = (acc[p] ?? 0) + 1;
    }
    return acc;
  }

  if (!isLoaded || state.isLoading) {
    return (
      <div className="exam-portal flex min-h-dvh items-center justify-center">
        <Loader2 className="size-8 animate-spin text-[var(--exam-action)]" />
      </div>
    );
  }

  if (!state.data) {
    return (
      <p className="exam-portal p-8 text-sm text-[var(--exam-not-answered)]">
        Attempt not found
      </p>
    );
  }

  if (!started || showInstructions) {
    return (
      <ExamInstructions
        title={state.data.test.title}
        durationMin={state.data.test.durationMin}
        questionCount={questions.length}
        onStart={() => {
          setShowInstructions(false);
          if (!started) {
            setStarted(true);
            const first = questions[0]?.index ?? 1;
            setIdx(first);
            pushEvent(first, "VISIT");
          }
        }}
      />
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

  const activeSection = current?.section ?? null;

  return (
    <div className="exam-portal flex min-h-dvh flex-col bg-[var(--exam-bg)]">
      {/* Top bar */}
      <header className="flex items-center justify-between border-b border-[var(--exam-border)] px-4 py-2.5">
        <div className="flex min-w-0 items-center gap-3">
          <button
            type="button"
            aria-label="Close exam"
            className="flex size-9 min-h-11 min-w-11 items-center justify-center rounded-md text-[var(--exam-muted-fg)] hover:bg-gray-100"
            onClick={() => {
              void flush();
              router.push("/tests");
            }}
          >
            <X className="size-5" />
          </button>
          <p className="truncate text-sm font-medium text-[var(--exam-fg)]">
            {state.data.test.title}
          </p>
          <p
            role="timer"
            aria-live="polite"
            aria-label={`Time remaining ${formatMs(remainingMs)}`}
            className={cn(
              "ml-2 font-mono text-sm font-semibold tabular-nums",
              remainingMs < 60_000
                ? "text-[var(--exam-not-answered)]"
                : "text-[var(--exam-muted-fg)]",
            )}
          >
            {formatMs(remainingMs)}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <span className="flex size-9 items-center justify-center rounded-full bg-[var(--exam-answered)] text-sm font-semibold text-white">
            {candidateInitial}
          </span>
          <span className="hidden text-sm font-medium sm:inline">
            {candidateName}
          </span>
        </div>
      </header>

      {/* Section tabs */}
      <div className="flex gap-2 overflow-x-auto border-b border-[var(--exam-border)] px-4 py-2">
        {(sections.length > 0 ? sections : ["EXAM"]).map((sec) => {
          const isActive =
            sections.length === 0
              ? true
              : activeSection === sec ||
                (!activeSection && sec === sections[0]);
          const sc = sections.length > 0 ? sectionCounts(sec) : counts;
          return (
            <button
              key={sec}
              type="button"
              title={
                sections.length > 0
                  ? `A:${sc.ANSWERED ?? 0} NA:${sc.NOT_ANSWERED ?? 0} M:${(sc.MARKED ?? 0) + (sc.ANSWERED_MARKED ?? 0)} NV:${sc.NOT_VISITED ?? 0}`
                  : undefined
              }
              className={cn(
                "rounded border px-3 py-1.5 text-xs font-semibold uppercase tracking-wide",
                isActive
                  ? "border-[var(--exam-fg)] bg-white text-[var(--exam-fg)]"
                  : "border-[var(--exam-border)] text-[var(--exam-muted-fg)] hover:bg-gray-50",
              )}
              onClick={() => {
                if (sections.length === 0) return;
                const q = questions.find((x) => x.section === sec);
                if (q) goTo(q.index);
              }}
            >
              {sec}
            </button>
          );
        })}
      </div>

      <div className="flex min-h-0 flex-1">
        {/* Question area */}
        <div className="flex min-w-0 flex-1 flex-col">
          <main className="flex-1 overflow-y-auto px-6 py-5">
            {current && (
              <>
                <p className="text-sm font-semibold text-[var(--exam-fg)]">
                  Q. {qPos} of {total}
                  {current.flagged ? (
                    <span className="ml-2 text-xs font-normal text-[var(--exam-muted-fg)]">
                      (excluded from scoring)
                    </span>
                  ) : null}
                </p>
                <div className="mt-3 text-[15px] leading-relaxed">
                  <ChatMarkdown content={current.text} />
                </div>
                {current.imageKeys?.length > 0 && (
                  <div className="mt-3 space-y-2">
                    {current.imageKeys.map((key) => (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        key={key}
                        src={figureSrc(key)}
                        alt={`Figure for question ${current.index}`}
                        className="max-h-64 w-auto max-w-full rounded border border-[var(--exam-border)] bg-white object-contain"
                        onError={(e) => {
                          (e.target as HTMLImageElement).alt =
                            "Figure unavailable — report this question";
                        }}
                      />
                    ))}
                  </div>
                )}
                <div className="mt-6 space-y-3">
                  {options.map((o) => {
                    const selected =
                      localPalette[current.index]?.selectedKey === o.key;
                    return (
                      <label
                        key={o.key}
                        className={cn(
                          "flex cursor-pointer items-start gap-3 rounded-lg px-1 py-2",
                          selected && "bg-blue-50",
                        )}
                      >
                        <span
                          className={cn(
                            "mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-full border-2 text-sm font-semibold",
                            selected
                              ? "border-[var(--exam-action)] bg-[var(--exam-action)] text-white"
                              : "border-[var(--exam-not-visited-border)] bg-white text-[var(--exam-fg)]",
                          )}
                        >
                          {o.key}
                        </span>
                        <input
                          type="radio"
                          className="sr-only"
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
                        <span className="flex flex-col gap-1 pt-1 text-sm">
                          <span>{o.text}</span>
                          {o.imageKey && (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img
                              src={figureSrc(o.imageKey)}
                              alt={`Option ${o.key} figure`}
                              className="max-h-32 w-auto rounded border border-[var(--exam-border)] object-contain"
                            />
                          )}
                        </span>
                      </label>
                    );
                  })}
                </div>
              </>
            )}
          </main>

          {/* Bottom action bar */}
          <footer
            className="flex flex-wrap items-center gap-2 border-t border-[var(--exam-border)] px-4 py-2.5"
            role="toolbar"
            aria-label="Exam navigation"
          >
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                aria-label="Mark for review and next"
                className="inline-flex min-h-11 items-center gap-1.5 rounded-md px-3 text-xs font-medium text-[var(--exam-fg)] hover:bg-gray-100"
                onClick={() => {
                  pushEvent(idx, "MARK_REVIEW");
                  const next = questions.find((q) => q.index > idx);
                  if (next) goTo(next.index);
                }}
              >
                <Star className="size-4" aria-hidden />
                MARK FOR REVIEW
              </button>
              <button
                type="button"
                aria-label="Clear response"
                className="inline-flex min-h-11 items-center gap-1.5 rounded-md px-3 text-xs font-medium text-[var(--exam-fg)] hover:bg-gray-100"
                onClick={() => pushEvent(idx, "CLEAR")}
              >
                <Trash2 className="size-4" aria-hidden />
                CLEAR
              </button>
            </div>

            <div className="mx-auto flex items-center gap-1">
              <button
                type="button"
                aria-label="Previous question"
                className="flex size-11 items-center justify-center rounded-md text-[var(--exam-muted-fg)] hover:bg-gray-100 disabled:opacity-40"
                disabled={qPos <= 1}
                onClick={() => {
                  const prev = questions[qPos - 2];
                  if (prev) goTo(prev.index);
                }}
              >
                <ChevronLeft className="size-5" />
              </button>
              <span className="min-w-[4.5rem] text-center text-sm font-medium tabular-nums">
                {qPos} of {total}
              </span>
              <button
                type="button"
                aria-label="Next question"
                className="flex size-11 items-center justify-center rounded-md text-[var(--exam-muted-fg)] hover:bg-gray-100 disabled:opacity-40"
                disabled={qPos >= total}
                onClick={() => {
                  const next = questions[qPos];
                  if (next) goTo(next.index);
                }}
              >
                <ChevronRight className="size-5" />
              </button>
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                aria-label="Save and next"
                className="inline-flex min-h-11 items-center gap-1 rounded-md bg-[var(--exam-action)] px-4 text-xs font-semibold text-[var(--exam-action-fg)] hover:brightness-95"
                onClick={() => {
                  pushEvent(idx, "SAVE_NEXT");
                  const next = questions.find((q) => q.index > idx);
                  if (next) goTo(next.index);
                }}
              >
                SAVE &amp; NEXT
                <ChevronRight className="size-4" aria-hidden />
              </button>
              <button
                type="button"
                className="flex size-11 items-center justify-center rounded-md border border-[var(--exam-border)] lg:hidden"
                aria-label={paletteOpen ? "Hide palette" : "Show palette"}
                onClick={() => setPaletteOpen((v) => !v)}
              >
                {paletteOpen ? (
                  <PanelRightClose className="size-4" />
                ) : (
                  <PanelRightOpen className="size-4" />
                )}
              </button>
            </div>
          </footer>
        </div>

        {/* Right palette */}
        <aside
          className={cn(
            "relative flex flex-col border-l border-[var(--exam-border)] bg-[var(--exam-panel)] transition-all",
            paletteOpen
              ? "w-full max-w-xs sm:w-72"
              : "w-0 overflow-hidden border-l-0",
            "max-lg:fixed max-lg:inset-y-0 max-lg:right-0 max-lg:z-40 max-lg:shadow-xl",
            !paletteOpen && "max-lg:hidden",
          )}
          aria-label="Question palette"
        >
          <button
            type="button"
            className="absolute -left-3 top-1/2 z-10 hidden size-6 -translate-y-1/2 items-center justify-center rounded-full border border-[var(--exam-border)] bg-white shadow lg:flex"
            aria-label={paletteOpen ? "Collapse palette" : "Expand palette"}
            onClick={() => setPaletteOpen((v) => !v)}
          >
            {paletteOpen ? (
              <ChevronRight className="size-3" />
            ) : (
              <ChevronLeft className="size-3" />
            )}
          </button>

          <div className="flex-1 overflow-y-auto p-4">
            <div className="grid grid-cols-5 gap-2" role="list">
              {questions.map((q) => {
                const st =
                  localPalette[q.index]?.paletteState ??
                  ("NOT_VISITED" as PaletteState);
                return (
                  <button
                    key={q.index}
                    type="button"
                    role="listitem"
                    aria-label={`Question ${q.index}, status ${st.replaceAll("_", " ").toLowerCase()}${q.index === idx ? ", current" : ""}`}
                    aria-current={q.index === idx ? "true" : undefined}
                    onClick={() => goTo(q.index)}
                    className={paletteCellClass(st, { current: q.index === idx })}
                  >
                    {q.index}
                    {st === "ANSWERED_MARKED" && (
                      <span
                        className="absolute bottom-0.5 right-0.5 size-2 rounded-full bg-[var(--exam-marked-dot)] ring-1 ring-white"
                        aria-hidden
                      />
                    )}
                  </button>
                );
              })}
            </div>

            <ul className="mt-6 space-y-2 text-xs text-[var(--exam-muted-fg)]">
              {PALETTE_LEGEND.map((item) => (
                <li key={item.state} className="flex items-center gap-2">
                  <span className={cn(paletteCellClass(item.state), "!size-5 !min-h-5 !min-w-5 !text-[10px]")}>
                    {item.hasDot && (
                      <span
                        className="absolute bottom-0 right-0 size-1.5 rounded-full bg-[var(--exam-marked-dot)]"
                        aria-hidden
                      />
                    )}
                  </span>
                  <span className="uppercase tracking-wide">
                    {item.label}
                    <span className="ml-1 font-semibold text-[var(--exam-fg)]">
                      {counts[item.state] ?? 0}
                    </span>
                  </span>
                </li>
              ))}
            </ul>

            <div className="mt-6 flex flex-wrap gap-3 text-xs font-semibold uppercase tracking-wide text-[var(--exam-muted-fg)]">
              <button
                type="button"
                className="hover:text-[var(--exam-fg)]"
                onClick={() => {
                  /* all questions = jump to first */
                  const first = questions[0];
                  if (first) goTo(first.index);
                }}
              >
                All questions
              </button>
              <button
                type="button"
                className="hover:text-[var(--exam-fg)]"
                onClick={() => setShowInstructions(true)}
              >
                Instructions
              </button>
            </div>
          </div>

          <div className="border-t border-[var(--exam-border)] p-3">
            <button
              type="button"
              aria-label="Submit test"
              className="w-full min-h-11 rounded-md bg-[var(--exam-submit)] text-sm font-semibold text-[var(--exam-submit-fg)] hover:brightness-95"
              onClick={() => setConfirmSubmit(true)}
            >
              SUBMIT
            </button>
          </div>
        </aside>
      </div>

      {confirmSubmit && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-md rounded-xl bg-white p-6 shadow-lg">
            <h2 className="text-lg font-semibold text-[var(--exam-fg)]">
              Submit test?
            </h2>
            <ul className="mt-3 space-y-1 text-sm text-[var(--exam-muted-fg)]">
              <li>
                Answered:{" "}
                {(counts.ANSWERED ?? 0) + (counts.ANSWERED_MARKED ?? 0)}
              </li>
              <li>
                Not answered:{" "}
                {(counts.NOT_ANSWERED ?? 0) + (counts.NOT_VISITED ?? 0)}
              </li>
              <li>
                Marked for review:{" "}
                {(counts.MARKED ?? 0) + (counts.ANSWERED_MARKED ?? 0)}
              </li>
            </ul>
            <div className="mt-4 flex justify-end gap-2">
              <button
                type="button"
                className="min-h-11 rounded-md border border-[var(--exam-border)] px-4 text-sm"
                onClick={() => setConfirmSubmit(false)}
              >
                Cancel
              </button>
              <button
                type="button"
                className="min-h-11 rounded-md bg-[var(--exam-submit)] px-4 text-sm font-semibold text-white disabled:opacity-50"
                disabled={submit.isPending}
                onClick={() => {
                  void flush().then(() =>
                    submit.mutate({ attemptId, autoTimeout: false }),
                  );
                }}
              >
                {submit.isPending ? "Submitting…" : "Confirm submit"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
