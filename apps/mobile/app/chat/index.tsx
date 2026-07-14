import { useAuth } from "@clerk/expo";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useRouter } from "expo-router";
import { useEffect, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  Text,
  View,
} from "react-native";
import { Button } from "../../src/components/ui/button";
import { cacheChats, listCachedChats, type LocalChat } from "../../src/chat-db";
import { trpc } from "../../src/trpc";

export default function ChatListScreen() {
  const { isSignedIn } = useAuth();
  const qc = useQueryClient();
  const router = useRouter();
  const [offline, setOffline] = useState<LocalChat[]>([]);

  const list = useQuery({
    ...trpc.chat.list.queryOptions(),
    enabled: !!isSignedIn,
  });

  useEffect(() => {
    void listCachedChats().then(setOffline);
  }, []);

  useEffect(() => {
    if (!list.data) return;
    const mapped = list.data.map((c) => ({
      id: c.id,
      title: c.title,
      updatedAt: new Date(c.updatedAt).toISOString(),
    }));
    void cacheChats(mapped).then(() => setOffline(mapped));
  }, [list.data]);

  const create = useMutation(
    trpc.chat.create.mutationOptions({
      onSuccess: (chat) => {
        void qc.invalidateQueries(trpc.chat.list.queryFilter());
        router.push(`/chat/${chat.id}`);
      },
    }),
  );

  const rows = list.data
    ? list.data.map((c) => ({
        id: c.id,
        title: c.title,
        updatedAt: new Date(c.updatedAt).toISOString(),
        preview: c.messages[0]?.content,
      }))
    : offline.map((c) => ({
        id: c.id,
        title: c.title,
        updatedAt: c.updatedAt,
        preview: undefined as string | undefined,
      }));

  return (
    <View className="flex-1 bg-white px-4 py-4 dark:bg-slate-950">
      <View className="mb-4 flex-row items-center justify-between">
        <Text className="text-xl font-semibold text-slate-900 dark:text-slate-50">
          Chat tutor
        </Text>
        <Button
          title={create.isPending ? "…" : "New"}
          onPress={() => create.mutate({})}
          disabled={!isSignedIn || create.isPending}
        />
      </View>

      {!isSignedIn && (
        <Text className="text-sm text-slate-500">Sign in to chat.</Text>
      )}

      {list.isLoading && rows.length === 0 && (
        <ActivityIndicator color="#2563eb" />
      )}

      {list.isError && offline.length > 0 && (
        <Text className="mb-2 text-xs text-amber-700">
          Offline — showing cached chats
        </Text>
      )}

      <FlatList
        data={rows}
        keyExtractor={(item) => item.id}
        ListEmptyComponent={
          <Text className="text-sm text-slate-500">No chats yet.</Text>
        }
        renderItem={({ item }) => (
          <Link href={`/chat/${item.id}`} asChild>
            <Pressable className="mb-2 rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
              <Text className="font-medium text-slate-900 dark:text-slate-50">
                {item.title}
              </Text>
              {item.preview ? (
                <Text className="mt-1 text-sm text-slate-500" numberOfLines={2}>
                  {item.preview}
                </Text>
              ) : null}
            </Pressable>
          </Link>
        )}
      />
    </View>
  );
}
