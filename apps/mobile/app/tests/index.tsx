import { useAuth } from "@clerk/expo";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useRouter } from "expo-router";
import { useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  Text,
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

  const list = useQuery({
    ...trpc.tests.list.queryOptions(),
    enabled: !!isSignedIn,
    refetchInterval: 5000,
  });
  const docs = useQuery({
    ...trpc.documents.list.queryOptions(),
    enabled: !!isSignedIn,
  });

  return (
    <View className="flex-1 bg-white px-4 py-4 dark:bg-slate-950">
      <Text className="mb-3 text-xl font-semibold text-slate-900 dark:text-slate-50">
        Tests
      </Text>
      <Text className="mb-2 text-sm text-slate-500">
        Select a library document as PYQ paper:
      </Text>
      <FlatList
        horizontal
        data={docs.data ?? []}
        keyExtractor={(d) => d.id}
        className="mb-3 max-h-24"
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
          // Break deep AppRouter instantiation for createFromPaper
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

      <FlatList
        className="mt-4"
        data={list.data ?? []}
        keyExtractor={(t) => t.id}
        ListEmptyComponent={
          list.isLoading ? (
            <ActivityIndicator color="#2563eb" />
          ) : (
            <Text className="text-sm text-slate-500">No tests yet.</Text>
          )
        }
        renderItem={({ item }) => (
          <Link href={`/tests/${item.id}`} asChild>
            <Pressable className="mb-2 rounded-xl border border-slate-200 p-3 dark:border-slate-800">
              <Text className="font-medium text-slate-900 dark:text-slate-50">
                {item.title}
              </Text>
              <Text className="text-xs text-slate-500">
                {item.status} · {item._count.questions} Q · {item.durationMin}m
              </Text>
            </Pressable>
          </Link>
        )}
      />
    </View>
  );
}
