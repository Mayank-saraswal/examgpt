import { useAuth } from "@clerk/expo";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  AppState,
  Image,
  Modal,
  Pressable,
  ScrollView,
  Text,
  useWindowDimensions,
  View,
} from "react-native";
import Markdown from "react-native-markdown-display";
import { randomUUID } from "expo-crypto";
import type { EventType, PaletteState, QuestionRuntimeState } from "@examgpt/ai";
import { colors } from "@examgpt/ui-tokens";
import {
  enqueueAttemptEvent,
  loadUnflushed,
  markFlushed,
} from "../../src/attempt-queue";
import { trpc } from "../../src/trpc";

const EX = colors.exam;

function formatMs(ms: number) {
  const s = Math.max(0, Math.floor(ms / 1000));
  const m = Math.floor(s / 60);
  const sec = s % 60;
  return `${m}:${String(sec).padStart(2, "0")}`;
}

function cellStyle(state: PaletteState) {
  switch (state) {
    case "ANSWERED":
      return { backgroundColor: EX.answered };
    case "NOT_ANSWERED":
      return { backgroundColor: EX.notAnswered };
    case "MARKED":
    case "ANSWERED_MARKED":
      return { backgroundColor: EX.marked };
    default:
      return {
        backgroundColor: EX.notVisited,
        borderWidth: 2,
        borderColor: EX.notVisitedBorder,
      };
  }
}

function cellTextColor(state: PaletteState) {
  return state === "NOT_VISITED" ? EX.notVisitedFg : "#ffffff";
}

export default function MobileExamScreen() {
  const { attemptId } = useLocalSearchParams<{ attemptId: string }>();
  const { isSignedIn } = useAuth();
  const router = useRouter();
  const { width, height } = useWindowDimensions();
  const landscape = width > height;

  const [started, setStarted] = useState(false);
  const [showInstructions, setShowInstructions] = useState(false);
  const [idx, setIdx] = useState(1);
  const [offsetMs, setOffsetMs] = useState(0);
  const [remainingMs, setRemainingMs] = useState(0);
  const [palette, setPalette] = useState<Record<number, QuestionRuntimeState>>(
    {},
  );
  const [confirm, setConfirm] = useState(false);
  const [paletteOpen, setPaletteOpen] = useState(false);

  const state = useQuery({
    ...trpc.attempts.resume.queryOptions({ attemptId }),
    enabled: !!isSignedIn && !!attemptId,
  });

  const serverTime = useQuery({
    ...trpc.attempts.serverTime.queryOptions(),
    enabled: started,
    refetchInterval: 60_000,
  });

  useEffect(() => {
    if (serverTime.data) {
      setOffsetMs(new Date(serverTime.data.serverNow).getTime() - Date.now());
    }
  }, [serverTime.data]);

  useEffect(() => {
    if (!state.data) return;
    setOffsetMs(new Date(state.data.serverNow).getTime() - Date.now());
    setRemainingMs(state.data.remainingMs);
    setPalette(
      JSON.parse(JSON.stringify(state.data.palette)) as Record<
        number,
        QuestionRuntimeState
      >,
    );
  }, [state.data]);

  useEffect(() => {
    if (!started || !state.data) return;
    const ends = new Date(state.data.attempt.endsAt).getTime();
    const id = setInterval(() => {
      setRemainingMs(Math.max(0, ends - (Date.now() + offsetMs)));
    }, 250);
    return () => clearInterval(id);
  }, [started, state.data, offsetMs]);

  const ingest = useMutation(trpc.attempts.ingestEvents.mutationOptions());
  const submit = useMutation(
    trpc.attempts.submit.mutationOptions({
      onSuccess: () => router.replace(`/exam/done?attemptId=${attemptId}`),
    }),
  );

  const flush = useCallback(async () => {
    const rows = await loadUnflushed(attemptId);
    if (rows.length === 0) return;
    const batchId = randomUUID();
    try {
      await ingest.mutateAsync({
        attemptId,
        batchId,
        events: rows.map((r) => ({
          questionIndex: r.questionIndex,
          type: r.type,
          optionKey: r.optionKey,
          clientTs: new Date(r.clientTs),
        })),
      });
      await markFlushed(rows.map((r) => r.id));
    } catch {
      /* keep queue */
    }
  }, [attemptId, ingest]);

  useEffect(() => {
    if (!started) return;
    const iv = setInterval(() => void flush(), 10_000);
    const sub = AppState.addEventListener("change", (s) => {
      if (s === "background" || s === "inactive") {
        void push(idx, "APP_BACKGROUND");
        void flush();
      }
      if (s === "active") void push(idx, "APP_FOREGROUND");
    });
    return () => {
      clearInterval(iv);
      sub.remove();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [started, flush, idx]);

  useEffect(() => {
    if (
      started &&
      remainingMs <= 0 &&
      state.data?.attempt.status === "IN_PROGRESS"
    ) {
      void flush().then(() =>
        submit.mutate({ attemptId, autoTimeout: true }),
      );
    }
  }, [remainingMs, started, attemptId, flush, submit, state.data?.attempt.status]);

  async function push(
    questionIndex: number,
    type: EventType,
    optionKey?: string | null,
  ) {
    await enqueueAttemptEvent(attemptId, {
      questionIndex,
      type,
      optionKey,
      clientTs: new Date().toISOString(),
    });
    setPalette((prev) => {
      const cur = prev[questionIndex] ?? {
        questionIndex,
        paletteState: "NOT_VISITED" as PaletteState,
        selectedKey: null,
        marked: false,
        visited: false,
        timeSpentSec: 0,
        visitCount: 0,
        optionChanges: 0,
      };
      const next = { ...cur };
      if (type === "VISIT") {
        next.visited = true;
        next.visitCount += 1;
      }
      if (type === "SELECT" || type === "CHANGE") {
        next.visited = true;
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

  type Q = {
    index: number;
    section: string | null;
    text: string;
    options: unknown;
    imageKeys: string[];
    flagged: boolean;
  };
  const questions: Q[] = state.data
    ? (JSON.parse(JSON.stringify(state.data.test.questions)) as Q[])
    : [];
  const current = questions.find((q) => q.index === idx) ?? questions[0];
  const options = (
    Array.isArray(current?.options) ? current!.options : []
  ) as { key: string; text: string; imageKey?: string }[];
  const total = questions.length;
  const qPos = questions.findIndex((q) => q.index === idx) + 1 || 1;

  const counts = useMemo(() => {
    const acc: Record<string, number> = {};
    for (const q of questions) {
      const p = palette[q.index]?.paletteState ?? "NOT_VISITED";
      acc[p] = (acc[p] ?? 0) + 1;
    }
    return acc;
  }, [questions, palette]);

  if (!state.data) {
    return (
      <View className="flex-1 items-center justify-center bg-white">
        <ActivityIndicator color={EX.action} />
      </View>
    );
  }

  if (!started || showInstructions) {
    return (
      <ScrollView
        className="flex-1 bg-white"
        contentContainerStyle={{ padding: 20, paddingBottom: 48 }}
      >
        <Text style={{ color: EX.mutedFg, fontSize: 13 }}>
          {state.data.test.title} · {state.data.test.durationMin} min ·{" "}
          {questions.length} questions
        </Text>
        <Text
          style={{
            color: EX.heading,
            fontSize: 18,
            fontWeight: "600",
            marginTop: 20,
          }}
        >
          General Instructions
        </Text>
        <Text style={{ color: EX.fg, fontSize: 14, marginTop: 10, lineHeight: 20 }}>
          1. The clock is server-controlled. When time runs out the exam
          auto-submits.
        </Text>
        <Text style={{ color: EX.fg, fontSize: 14, marginTop: 8, lineHeight: 20 }}>
          2. Palette statuses:
        </Text>
        {(
          [
            ["ANSWERED", "Answered", false],
            ["NOT_ANSWERED", "Not answered", false],
            ["MARKED", "Marked for review", false],
            ["NOT_VISITED", "Not visited", false],
            ["ANSWERED_MARKED", "Answered & marked", true],
          ] as const
        ).map(([st, label, dot]) => (
          <View
            key={st}
            style={{ flexDirection: "row", alignItems: "center", marginTop: 8 }}
          >
            <View
              style={[
                {
                  width: 28,
                  height: 28,
                  borderRadius: 14,
                  alignItems: "center",
                  justifyContent: "center",
                },
                cellStyle(st),
              ]}
            >
              <Text style={{ color: cellTextColor(st), fontSize: 11, fontWeight: "700" }}>
                15
              </Text>
              {dot ? (
                <View
                  style={{
                    position: "absolute",
                    bottom: 1,
                    right: 1,
                    width: 7,
                    height: 7,
                    borderRadius: 4,
                    backgroundColor: EX.markedDot,
                  }}
                />
              ) : null}
            </View>
            <Text style={{ marginLeft: 10, color: EX.fg, fontSize: 13 }}>
              {label}
            </Text>
          </View>
        ))}
        <Text style={{ color: EX.mutedFg, fontSize: 13, marginTop: 12, lineHeight: 18 }}>
          Marked for Review with an answer still counts at submit (NTA rule).
        </Text>
        <Text
          style={{
            color: EX.heading,
            fontSize: 18,
            fontWeight: "600",
            marginTop: 24,
          }}
        >
          Answering questions
        </Text>
        <Text style={{ color: EX.fg, fontSize: 14, marginTop: 8, lineHeight: 20 }}>
          Select an option, use CLEAR to deselect, MARK FOR REVIEW & NEXT to
          flag, SAVE & NEXT to save and advance.
        </Text>
        <Pressable
          accessibilityRole="button"
          onPress={() => {
            setShowInstructions(false);
            if (!started) {
              setStarted(true);
              const first = questions[0]?.index ?? 1;
              setIdx(first);
              void push(first, "VISIT");
            }
          }}
          style={{
            marginTop: 32,
            alignSelf: "center",
            backgroundColor: EX.action,
            paddingHorizontal: 40,
            paddingVertical: 14,
            borderRadius: 8,
            minHeight: 48,
            justifyContent: "center",
          }}
        >
          <Text style={{ color: "#fff", fontWeight: "700", fontSize: 15 }}>
            START TEST
          </Text>
        </Pressable>
      </ScrollView>
    );
  }

  const api = process.env.EXPO_PUBLIC_API_URL ?? "http://localhost:4000";

  return (
    <View className="flex-1 bg-white">
      {/* Header */}
      <View
        style={{
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "space-between",
          borderBottomWidth: 1,
          borderBottomColor: EX.border,
          paddingHorizontal: 12,
          paddingVertical: 10,
          minHeight: 48,
        }}
      >
        <Text
          style={{ flex: 1, fontSize: 14, fontWeight: "600", color: EX.fg }}
          numberOfLines={1}
        >
          {state.data.test.title}
        </Text>
        <Text
          style={{
            fontFamily: "monospace",
            fontSize: landscape ? 16 : 18,
            fontWeight: "700",
            color: remainingMs < 60_000 ? EX.notAnswered : EX.fg,
            marginLeft: 8,
          }}
        >
          {formatMs(remainingMs)}
        </Text>
        <Text
          style={{
            marginLeft: 12,
            fontSize: 13,
            fontWeight: "600",
            color: EX.mutedFg,
          }}
        >
          {qPos}/{total}
        </Text>
      </View>

      <ScrollView
        className="flex-1"
        contentContainerStyle={{ padding: 16, paddingBottom: 24 }}
      >
        {current && (
          <>
            <Text style={{ fontSize: 14, fontWeight: "700", color: EX.fg }}>
              Q. {qPos} of {total}
            </Text>
            <Markdown>{current.text}</Markdown>
            {current.imageKeys?.map((key) => (
              <View
                key={key}
                style={{
                  marginVertical: 8,
                  borderWidth: 1,
                  borderColor: EX.border,
                  borderRadius: 8,
                  overflow: "hidden",
                }}
              >
                <Image
                  source={{
                    uri: `${api}/storage/local/${key
                      .split("/")
                      .map(encodeURIComponent)
                      .join("/")}`,
                  }}
                  style={{ width: "100%", height: 160 }}
                  resizeMode="contain"
                  accessibilityLabel={`Figure for question ${current.index}`}
                />
                <Text style={{ fontSize: 11, color: EX.mutedFg, padding: 6 }}>
                  If the figure fails to load, report this question.
                </Text>
              </View>
            ))}
            {options.map((o) => {
              const sel = palette[current.index]?.selectedKey === o.key;
              return (
                <Pressable
                  key={o.key}
                  onPress={() =>
                    void push(current.index, sel ? "CHANGE" : "SELECT", o.key)
                  }
                  style={{
                    flexDirection: "row",
                    alignItems: "flex-start",
                    gap: 12,
                    marginBottom: 10,
                    minHeight: 44,
                    paddingVertical: 6,
                    paddingHorizontal: 4,
                    borderRadius: 8,
                    backgroundColor: sel ? "#eff6ff" : "transparent",
                  }}
                >
                  <View
                    style={{
                      width: 32,
                      height: 32,
                      borderRadius: 16,
                      borderWidth: 2,
                      borderColor: sel ? EX.action : EX.notVisitedBorder,
                      backgroundColor: sel ? EX.action : "#fff",
                      alignItems: "center",
                      justifyContent: "center",
                    }}
                  >
                    <Text
                      style={{
                        fontWeight: "700",
                        color: sel ? "#fff" : EX.fg,
                        fontSize: 13,
                      }}
                    >
                      {o.key}
                    </Text>
                  </View>
                  <Text style={{ flex: 1, fontSize: 14, color: EX.fg, paddingTop: 6 }}>
                    {o.text}
                  </Text>
                </Pressable>
              );
            })}
          </>
        )}
      </ScrollView>

      {/* Sticky bottom action bar */}
      <View
        style={{
          borderTopWidth: 1,
          borderTopColor: EX.border,
          paddingHorizontal: 8,
          paddingVertical: 8,
          flexDirection: "row",
          flexWrap: "wrap",
          alignItems: "center",
          gap: 6,
          backgroundColor: "#fff",
        }}
      >
        <Pressable
          accessibilityRole="button"
          onPress={() => {
            void push(idx, "MARK_REVIEW");
            const n = questions.find((q) => q.index > idx);
            if (n) {
              setIdx(n.index);
              void push(n.index, "VISIT");
            }
          }}
          style={{ minHeight: 44, paddingHorizontal: 10, justifyContent: "center" }}
        >
          <Text style={{ fontSize: 12, fontWeight: "600", color: EX.fg }}>
            MARK FOR REVIEW
          </Text>
        </Pressable>
        <Pressable
          accessibilityRole="button"
          onPress={() => void push(idx, "CLEAR")}
          style={{ minHeight: 44, paddingHorizontal: 10, justifyContent: "center" }}
        >
          <Text style={{ fontSize: 12, fontWeight: "600", color: EX.fg }}>
            CLEAR
          </Text>
        </Pressable>
        <View style={{ flex: 1, flexDirection: "row", justifyContent: "center", alignItems: "center" }}>
          <Pressable
            accessibilityRole="button"
            disabled={qPos <= 1}
            onPress={() => {
              const p = questions[qPos - 2];
              if (p) {
                void push(idx, "LEAVE");
                setIdx(p.index);
                void push(p.index, "VISIT");
              }
            }}
            style={{ minHeight: 44, minWidth: 44, alignItems: "center", justifyContent: "center" }}
          >
            <Text style={{ fontSize: 18, color: EX.mutedFg }}>‹</Text>
          </Pressable>
          <Text style={{ fontSize: 13, fontWeight: "600", color: EX.fg }}>
            {qPos} of {total}
          </Text>
          <Pressable
            accessibilityRole="button"
            disabled={qPos >= total}
            onPress={() => {
              const n = questions[qPos];
              if (n) {
                void push(idx, "LEAVE");
                setIdx(n.index);
                void push(n.index, "VISIT");
              }
            }}
            style={{ minHeight: 44, minWidth: 44, alignItems: "center", justifyContent: "center" }}
          >
            <Text style={{ fontSize: 18, color: EX.mutedFg }}>›</Text>
          </Pressable>
        </View>
        <Pressable
          accessibilityRole="button"
          onPress={() => {
            void push(idx, "SAVE_NEXT");
            const n = questions.find((q) => q.index > idx);
            if (n) {
              setIdx(n.index);
              void push(n.index, "VISIT");
            }
          }}
          style={{
            minHeight: 44,
            backgroundColor: EX.action,
            paddingHorizontal: 14,
            borderRadius: 6,
            justifyContent: "center",
          }}
        >
          <Text style={{ color: "#fff", fontWeight: "700", fontSize: 12 }}>
            SAVE & NEXT
          </Text>
        </Pressable>
        <Pressable
          accessibilityRole="button"
          onPress={() => setPaletteOpen(true)}
          style={{
            minHeight: 44,
            minWidth: 44,
            borderWidth: 1,
            borderColor: EX.border,
            borderRadius: 6,
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <Text style={{ fontSize: 12, fontWeight: "700", color: EX.fg }}>#</Text>
        </Pressable>
      </View>

      {/* Palette bottom sheet */}
      <Modal
        visible={paletteOpen}
        animationType="slide"
        transparent
        onRequestClose={() => setPaletteOpen(false)}
      >
        <Pressable
          style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.35)" }}
          onPress={() => setPaletteOpen(false)}
        />
        <View
          style={{
            backgroundColor: "#fff",
            borderTopLeftRadius: 16,
            borderTopRightRadius: 16,
            maxHeight: landscape ? "90%" : "70%",
            padding: 16,
            paddingBottom: 28,
          }}
        >
          <Text style={{ fontWeight: "700", fontSize: 15, marginBottom: 12 }}>
            Question palette
          </Text>
          <ScrollView>
            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
              {questions.map((q) => {
                const st =
                  palette[q.index]?.paletteState ?? ("NOT_VISITED" as PaletteState);
                return (
                  <Pressable
                    key={q.index}
                    accessibilityRole="button"
                    accessibilityLabel={`Question ${q.index}`}
                    onPress={() => {
                      void push(idx, "LEAVE");
                      setIdx(q.index);
                      void push(q.index, "VISIT");
                      setPaletteOpen(false);
                    }}
                    style={[
                      {
                        width: 44,
                        height: 44,
                        borderRadius: 22,
                        alignItems: "center",
                        justifyContent: "center",
                      },
                      cellStyle(st),
                      q.index === idx
                        ? { borderWidth: 2, borderColor: EX.action }
                        : null,
                    ]}
                  >
                    <Text
                      style={{
                        color: cellTextColor(st),
                        fontWeight: "700",
                        fontSize: 13,
                      }}
                    >
                      {q.index}
                    </Text>
                    {st === "ANSWERED_MARKED" ? (
                      <View
                        style={{
                          position: "absolute",
                          bottom: 3,
                          right: 3,
                          width: 8,
                          height: 8,
                          borderRadius: 4,
                          backgroundColor: EX.markedDot,
                        }}
                      />
                    ) : null}
                  </Pressable>
                );
              })}
            </View>
            <Text style={{ marginTop: 16, fontSize: 12, color: EX.mutedFg }}>
              Answered {counts.ANSWERED ?? 0} · Not answered{" "}
              {counts.NOT_ANSWERED ?? 0} · Marked{" "}
              {(counts.MARKED ?? 0) + (counts.ANSWERED_MARKED ?? 0)} · Not
              visited {counts.NOT_VISITED ?? 0}
            </Text>
            <View style={{ flexDirection: "row", gap: 16, marginTop: 12 }}>
              <Pressable onPress={() => setShowInstructions(true)}>
                <Text style={{ fontSize: 12, fontWeight: "700", color: EX.mutedFg }}>
                  INSTRUCTIONS
                </Text>
              </Pressable>
            </View>
          </ScrollView>
          <Pressable
            onPress={() => {
              setPaletteOpen(false);
              setConfirm(true);
            }}
            style={{
              marginTop: 16,
              backgroundColor: EX.submit,
              minHeight: 48,
              borderRadius: 8,
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <Text style={{ color: "#fff", fontWeight: "700", fontSize: 15 }}>
              SUBMIT
            </Text>
          </Pressable>
        </View>
      </Modal>

      {confirm && (
        <View
          style={{
            position: "absolute",
            inset: 0,
            backgroundColor: "rgba(0,0,0,0.4)",
            alignItems: "center",
            justifyContent: "center",
            padding: 24,
          }}
        >
          <View
            style={{
              width: "100%",
              backgroundColor: "#fff",
              borderRadius: 12,
              padding: 20,
            }}
          >
            <Text style={{ fontSize: 18, fontWeight: "700", color: EX.fg }}>
              Submit test?
            </Text>
            <Text style={{ marginTop: 8, color: EX.mutedFg, fontSize: 13 }}>
              Answered:{" "}
              {(counts.ANSWERED ?? 0) + (counts.ANSWERED_MARKED ?? 0)} · Marked:{" "}
              {(counts.MARKED ?? 0) + (counts.ANSWERED_MARKED ?? 0)}
            </Text>
            <Pressable
              onPress={() =>
                void flush().then(() => submit.mutate({ attemptId }))
              }
              style={{
                marginTop: 16,
                backgroundColor: EX.submit,
                minHeight: 48,
                borderRadius: 8,
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <Text style={{ color: "#fff", fontWeight: "700" }}>
                {submit.isPending ? "…" : "Confirm"}
              </Text>
            </Pressable>
            <Pressable
              onPress={() => setConfirm(false)}
              style={{
                marginTop: 8,
                minHeight: 44,
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <Text style={{ color: EX.mutedFg, fontWeight: "600" }}>Cancel</Text>
            </Pressable>
          </View>
        </View>
      )}
    </View>
  );
}
