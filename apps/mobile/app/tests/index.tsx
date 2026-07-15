import { useAuth } from "@clerk/expo";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useRouter } from "expo-router";
import { useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
} from "react-native";
import { Button } from "../../src/components/ui/button";
import { trpc, trpcClient } from "../../src/trpc";

export default function TestsScreen() {
  const { isSignedIn } = useAuth();
  const qc = useQueryClient();
  const router = useRouter();
  const [docId, setDocId] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [genTitle, setGenTitle] = useState("Adaptive practice");
  const [genCount, setGenCount] = useState("15");
  const [generating, setGenerating] = useState(false);
  const [mode, setMode] = useState<"auto" | "manual">("auto");
  const [selected, setSelected] = useState<string[]>([]);

  const list = useQuery({
    ...trpc.tests.list.queryOptions(),
    enabled: !!isSignedIn,
    refetchInterval: 5000,
  });
  const docs = useQuery({
    ...trpc.documents.list.queryOptions(),
    enabled: !!isSignedIn,
  });
  const genTopics = useQuery({
    ...trpc.tests.generationTopics.queryOptions(),
    enabled: !!isSignedIn,
  });

  const topics = [
    ...new Set([
      ...(genTopics.data?.weakTopics ?? []),
      ...(genTopics.data?.syllabusTopics ?? []),
    ]),
  ];

  return (
    <ScrollView className="flex-1 bg-white px-4 py-4 dark:bg-slate-950">
      <Text className="mb-3 text-xl font-semibold text-slate-900 dark:text-slate-50">
        Tests
      </Text>

      <Text className="mb-2 text-sm font-medium text-slate-700 dark:text-slate-200">
        PYQ from library
      </Text>
      <FlatList
        horizontal
        data={docs.data ?? []}
        keyExtractor={(d) => d.id}
        className="mb-3 max-h-24"
        scrollEnabled={false}
        renderItem={({ item }) => (
          <Pressable
            onPress={() => setDocId(item.id)}
            className={`mr-2 rounded-lg border px-3 py-2 ${
              docId === item.id
                ? "border-primary-600 bg-primary-50"
                : "border-slate-200"
            }`}
          >
            <Text className="text-xs">{item.title}</Text>
          </Pressable>
        )}
      />
      <Button
        title={creating ? "…" : "Prepare paper"}
        disabled={!docId || creating}
        onPress={() => {
          if (!docId) return;
          setCreating(true);
          const createPaper = trpcClient.tests.createFromPaper as {
            mutate: (input: { documentId: string }) => Promise<{ id: string }>;
          };
          void createPaper
            .mutate({ documentId: docId })
            .then((t) => {
              void qc.invalidateQueries(trpc.tests.list.queryFilter());
              router.push(`/tests/${t.id}`);
            })
            .finally(() => setCreating(false));
        }}
      />

      <View className="mt-6 rounded-xl border border-slate-200 p-3 dark:border-slate-800">
        <Text className="mb-2 font-medium text-slate-900 dark:text-slate-50">
          Generate AI paper
        </Text>
        <Text className="mb-2 text-xs text-slate-500 dark:text-slate-400">
          Text-only in v1 — AI papers do not include diagrams or figures.
        </Text>
        <TextInput
          value={genTitle}
          onChangeText={setGenTitle}
          placeholder="Title"
          className="mb-2 rounded-lg border border-slate-200 px-3 py-2 text-sm dark:border-slate-700 dark:text-slate-100"
        />
        <TextInput
          value={genCount}
          onChangeText={setGenCount}
          keyboardType="number-pad"
          placeholder="Question count"
          className="mb-2 rounded-lg border border-slate-200 px-3 py-2 text-sm dark:border-slate-700 dark:text-slate-100"
        />
        <View className="mb-2 flex-row gap-2">
          <Pressable
            onPress={() => setMode("auto")}
            className={`rounded-full px-3 py-1 ${
              mode === "auto" ? "bg-blue-600" : "border border-slate-300"
            }`}
          >
            <Text
              className={`text-xs ${mode === "auto" ? "text-white" : "text-slate-600"}`}
            >
              Auto
            </Text>
          </Pressable>
          <Pressable
            onPress={() => setMode("manual")}
            className={`rounded-full px-3 py-1 ${
              mode === "manual" ? "bg-blue-600" : "border border-slate-300"
            }`}
          >
            <Text
              className={`text-xs ${mode === "manual" ? "text-white" : "text-slate-600"}`}
            >
              Manual
            </Text>
          </Pressable>
        </View>
        {mode === "manual" && (
          <View className="mb-2 max-h-28 flex-row flex-wrap gap-1">
            {topics.slice(0, 24).map((t) => {
              const on = selected.includes(t);
              return (
                <Pressable
                  key={t}
                  onPress={() =>
                    setSelected((p) =>
                      on ? p.filter((x) => x !== t) : [...p, t],
                    )
                  }
                  className={`rounded-full px-2 py-0.5 ${
                    on ? "bg-blue-600" : "border border-slate-300"
                  }`}
                >
                  <Text
                    className={`text-xs ${on ? "text-white" : "text-slate-600"}`}
                  >
                    {t}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        )}
        <Button
          title={generating ? "…" : "Generate paper"}
          disabled={
            generating ||
            !genTitle.trim() ||
            (mode === "manual" && selected.length === 0)
          }
          onPress={() => {
            setGenerating(true);
            const createGenerated = trpcClient.tests.createGenerated as {
              mutate: (input: {
                title: string;
                questionCount: number;
                durationMin: number;
                mode: "auto" | "manual";
                topics?: string[];
                difficulty: "mixed";
              }) => Promise<{ id: string }>;
            };
            void createGenerated
              .mutate({
                title: genTitle.trim(),
                questionCount: Math.min(
                  100,
                  Math.max(5, Number(genCount) || 15),
                ),
                durationMin: 60,
                mode,
                topics: mode === "manual" ? selected : undefined,
                difficulty: "mixed",
              })
              .then((t) => {
                void qc.invalidateQueries(trpc.tests.list.queryFilter());
                router.push(`/tests/${t.id}`);
              })
              .finally(() => setGenerating(false));
          }}
        />
      </View>

      <Text className="mb-2 mt-6 text-sm font-medium text-slate-700 dark:text-slate-200">
        Your tests
      </Text>
      {(list.data ?? []).map((item) => (
        <Link key={item.id} href={`/tests/${item.id}`} asChild>
          <Pressable className="mb-2 rounded-xl border border-slate-200 p-3 dark:border-slate-800">
            <Text className="font-medium text-slate-900 dark:text-slate-50">
              {item.title}
            </Text>
            <Text className="text-xs text-slate-500">
              {item.source === "AI_GENERATED" ? "AI · " : "PYQ · "}
              {item.status} · {item._count.questions} Q · {item.durationMin}m
            </Text>
          </Pressable>
        </Link>
      ))}
      {!list.isLoading && (list.data?.length ?? 0) === 0 && (
        <Text className="text-sm text-slate-500">No tests yet.</Text>
      )}
      {list.isLoading && <ActivityIndicator color="#2563eb" />}
      <View className="h-10" />
    </ScrollView>
  );
}
