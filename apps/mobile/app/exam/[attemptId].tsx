import { useAuth } from "@clerk/expo";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  AppState,
  Image,
  Pressable,
  ScrollView,
  Text,
  View,
} from "react-native";
import Markdown from "react-native-markdown-display";
import { randomUUID } from "expo-crypto";
import type { EventType, PaletteState, QuestionRuntimeState } from "@examgpt/ai";
import { Button } from "../../src/components/ui/button";
import {
  enqueueAttemptEvent,
  loadUnflushed,
  markFlushed,
} from "../../src/attempt-queue";
import { trpc } from "../../src/trpc";

function formatMs(ms: number) {
  const s = Math.max(0, Math.floor(ms / 1000));
  const m = Math.floor(s / 60);
  const sec = s % 60;
  return `${m}:${String(sec).padStart(2, "0")}`;
}

export default function MobileExamScreen() {
  const { attemptId } = useLocalSearchParams<{ attemptId: string }>();
  const { isSignedIn } = useAuth();
  const router = useRouter();
  const [started, setStarted] = useState(false);
  const [idx, setIdx] = useState(1);
  const [offsetMs, setOffsetMs] = useState(0);
  const [remainingMs, setRemainingMs] = useState(0);
  const [palette, setPalette] = useState<Record<number, QuestionRuntimeState>>(
    {},
  );
  const [confirm, setConfirm] = useState(false);

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
  const options = (Array.isArray(current?.options)
    ? current!.options
    : []) as { key: string; text: string }[];

  if (!state.data) {
    return (
      <View className="flex-1 items-center justify-center">
        <ActivityIndicator color="#2563eb" />
      </View>
    );
  }

  if (!started) {
    return (
      <ScrollView className="flex-1 bg-white px-4 py-6 dark:bg-slate-950">
        <Text className="text-xl font-semibold">Instructions</Text>
        <Text className="mt-2 text-sm text-slate-500">
          {state.data.test.title} · {state.data.test.durationMin} min ·{" "}
          {questions.length} Q
        </Text>
        <Text className="mt-4 text-sm">
          Timer is server-controlled. Palette: gray outline / red / green /
          amber / amber+green dot. Answered & Marked counts at submit.
        </Text>
        <Button
          title="START TEST"
          onPress={() => {
            setStarted(true);
            const first = questions[0]?.index ?? 1;
            setIdx(first);
            void push(first, "VISIT");
          }}
        />
      </ScrollView>
    );
  }

  return (
    <View className="flex-1 bg-white dark:bg-slate-950">
      <View className="flex-row items-center justify-between border-b border-slate-200 px-3 py-2">
        <Text className="flex-1 text-sm font-medium" numberOfLines={1}>
          {state.data.test.title}
        </Text>
        <Text className="font-mono text-lg font-semibold">
          {formatMs(remainingMs)}
        </Text>
      </View>

      <ScrollView className="flex-1 px-3 py-3">
        {current && (
          <>
            <Text className="text-xs text-slate-500">Q{current.index}</Text>
            <Markdown>{current.text}</Markdown>
            {current.imageKeys?.length > 0 &&
              current.imageKeys.map((key) => {
                const api =
                  process.env.EXPO_PUBLIC_API_URL ?? "http://localhost:4000";
                const src = `${api}/storage/local/${key
                  .split("/")
                  .map(encodeURIComponent)
                  .join("/")}`;
                return (
                  <View
                    key={key}
                    className="my-2 overflow-hidden rounded-lg border border-slate-200"
                  >
                    <Image
                      source={{ uri: src }}
                      style={{ width: "100%", height: 180 }}
                      resizeMode="contain"
                      accessibilityLabel={`Figure for question ${current.index}`}
                    />
                    <Text className="px-2 py-1 text-xs text-slate-400">
                      If the figure fails to load, report this question.
                    </Text>
                  </View>
                );
              })}
            {options.map((o) => {
              const sel = palette[current.index]?.selectedKey === o.key;
              const optImg = (o as { imageKey?: string }).imageKey;
              const api =
                process.env.EXPO_PUBLIC_API_URL ?? "http://localhost:4000";
              return (
                <Pressable
                  key={o.key}
                  onPress={() =>
                    void push(current.index, sel ? "CHANGE" : "SELECT", o.key)
                  }
                  className={`mb-2 rounded-lg border px-3 py-2 ${
                    sel ? "border-primary-600 bg-primary-50" : "border-slate-200"
                  }`}
                >
                  <Text>
                    {o.key}. {o.text}
                  </Text>
                  {optImg ? (
                    <Image
                      source={{
                        uri: `${api}/storage/local/${optImg
                          .split("/")
                          .map(encodeURIComponent)
                          .join("/")}`,
                      }}
                      style={{ width: "100%", height: 100, marginTop: 6 }}
                      resizeMode="contain"
                      accessibilityLabel={`Option ${o.key} figure`}
                    />
                  ) : null}
                </Pressable>
              );
            })}
          </>
        )}
      </ScrollView>

      <View className="flex-row flex-wrap gap-2 border-t border-slate-200 p-2">
        <Button
          title="Prev"
          variant="outline"
          onPress={() => {
            void push(idx, "LEAVE");
            const p = questions.filter((q) => q.index < idx).at(-1);
            if (p) {
              setIdx(p.index);
              void push(p.index, "VISIT");
            }
          }}
        />
        <Button
          title="Save & Next"
          onPress={() => {
            void push(idx, "SAVE_NEXT");
            const n = questions.find((q) => q.index > idx);
            if (n) {
              setIdx(n.index);
              void push(n.index, "VISIT");
            }
          }}
        />
        <Button
          title="Clear"
          variant="outline"
          onPress={() => void push(idx, "CLEAR")}
        />
        <Button
          title="Mark"
          variant="outline"
          onPress={() => void push(idx, "MARK_REVIEW")}
        />
        <Button title="Submit" onPress={() => setConfirm(true)} />
      </View>

      <ScrollView horizontal className="max-h-16 border-t border-slate-100 px-2 py-1">
        {questions.map((q) => {
          const st = palette[q.index]?.paletteState ?? "NOT_VISITED";
          const bg =
            st === "ANSWERED"
              ? "bg-green-100 border-green-600"
              : st === "NOT_ANSWERED"
                ? "bg-red-50 border-red-500"
                : st === "MARKED" || st === "ANSWERED_MARKED"
                  ? "bg-amber-50 border-amber-500"
                  : "border-slate-400";
          return (
            <Pressable
              key={q.index}
              onPress={() => {
                void push(idx, "LEAVE");
                setIdx(q.index);
                void push(q.index, "VISIT");
              }}
              className={`mr-1 size-9 items-center justify-center rounded border-2 ${bg}`}
            >
              <Text className="text-xs font-semibold">{q.index}</Text>
            </Pressable>
          );
        })}
      </ScrollView>

      {confirm && (
        <View className="absolute inset-0 items-center justify-center bg-black/40 px-6">
          <View className="w-full rounded-xl bg-white p-4 dark:bg-slate-900">
            <Text className="text-lg font-semibold">Submit test?</Text>
            <Button
              title={submit.isPending ? "…" : "Confirm"}
              onPress={() =>
                void flush().then(() => submit.mutate({ attemptId }))
              }
            />
            <Button
              title="Cancel"
              variant="outline"
              onPress={() => setConfirm(false)}
            />
          </View>
        </View>
      )}
    </View>
  );
}
