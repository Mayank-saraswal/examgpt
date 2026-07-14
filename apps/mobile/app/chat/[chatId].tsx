import { useAuth } from "@clerk/expo";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  Text,
  TextInput,
  View,
} from "react-native";
import Markdown from "react-native-markdown-display";
import { randomUUID } from "expo-crypto";
import {
  listLocalMessages,
  listUnsyncedMessages,
  markSynced,
  upsertLocalMessage,
  type LocalMessage,
} from "../../src/chat-db";
import { streamChatMessage } from "../../src/chat-stream";
import { trpc } from "../../src/trpc";

type UiCitation = { documentId: string; title: string; pageNumber: number };
type UiWeb = { url: string; title: string };

type UiMsg = {
  id: string;
  clientId: string;
  role: "USER" | "ASSISTANT";
  content: string;
  citations?: UiCitation[];
  webSources?: UiWeb[];
  kind?: string | null;
};

function asCitations(v: unknown): UiCitation[] | undefined {
  if (!Array.isArray(v)) return undefined;
  return v as UiCitation[];
}

function asWebSources(v: unknown): UiWeb[] | undefined {
  if (!Array.isArray(v)) return undefined;
  return v as UiWeb[];
}

export default function ChatThreadScreen() {
  const { chatId } = useLocalSearchParams<{ chatId: string }>();
  const { getToken, isSignedIn } = useAuth();
  const router = useRouter();
  const qc = useQueryClient();
  const [input, setInput] = useState("");
  const [msgs, setMsgs] = useState<UiMsg[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [offerWeb, setOfferWeb] = useState(false);

  const chat = useQuery({
    ...trpc.chat.get.queryOptions({ id: chatId }),
    enabled: !!isSignedIn && !!chatId,
  });

  const sync = useMutation(trpc.chat.syncMessages.mutationOptions());

  // Load local cache first (offline readable)
  useEffect(() => {
    if (!chatId) return;
    void listLocalMessages(chatId).then((rows) => {
      if (rows.length === 0) return;
      setMsgs(
        rows.map((r) => ({
          id: r.id,
          clientId: r.clientId,
          role: r.role,
          content: r.content,
          citations: r.citationsJson
            ? (JSON.parse(r.citationsJson) as UiMsg["citations"])
            : undefined,
          webSources: r.webSourcesJson
            ? (JSON.parse(r.webSourcesJson) as UiMsg["webSources"])
            : undefined,
          kind: r.kind,
        })),
      );
    });
  }, [chatId]);

  // Merge server messages into local cache
  useEffect(() => {
    if (!chat.data?.messages) return;
    // Detach Prisma JsonValue depth from the type graph
    const serverMsgs = JSON.parse(JSON.stringify(chat.data.messages)) as {
      id: string;
      clientId: string;
      role: "USER" | "ASSISTANT";
      content: string;
      citations: unknown;
      webSources: unknown;
      kind: string | null;
      createdAt: string;
    }[];
    const mapped: UiMsg[] = serverMsgs.map((m) => ({
      id: m.id,
      clientId: m.clientId,
      role: m.role,
      content: m.content,
      citations: asCitations(m.citations),
      webSources: asWebSources(m.webSources),
      kind: m.kind,
    }));
    setMsgs(mapped);
    void (async () => {
      for (const m of serverMsgs) {
        const cits = asCitations(m.citations);
        const webs = asWebSources(m.webSources);
        await upsertLocalMessage({
          id: m.id,
          chatId,
          clientId: m.clientId,
          role: m.role,
          content: m.content,
          citationsJson: cits ? JSON.stringify(cits) : null,
          webSourcesJson: webs ? JSON.stringify(webs) : null,
          kind: m.kind,
          createdAt: new Date(m.createdAt).toISOString(),
          synced: 1,
        });
      }
    })();
  }, [chat.data?.messages, chatId]);

  // Background flush of unsynced (optimistic) messages on reconnect
  useEffect(() => {
    if (!isSignedIn || !chatId) return;
    void (async () => {
      const pending = await listUnsyncedMessages(chatId);
      if (pending.length === 0) return;
      try {
        await sync.mutateAsync({
          chatId,
          messages: pending.map((p) => ({
            clientId: p.clientId,
            role: p.role,
            content: p.content,
            kind: p.kind ?? undefined,
            createdAt: new Date(p.createdAt),
          })),
        });
        await markSynced(pending.map((p) => p.clientId));
      } catch {
        /* stay offline */
      }
    })();
  }, [chatId, isSignedIn, sync]);

  const send = useCallback(
    async (forceWeb = false) => {
      const text = input.trim();
      if (!text || busy || !chatId) return;
      setBusy(true);
      setError(null);
      setOfferWeb(false);
      setInput("");

      const userClientId = randomUUID();
      const userLocal: LocalMessage = {
        id: userClientId,
        chatId,
        clientId: userClientId,
        role: "USER",
        content: text,
        citationsJson: null,
        webSourcesJson: null,
        kind: null,
        createdAt: new Date().toISOString(),
        synced: 0,
      };
      await upsertLocalMessage(userLocal);
      setMsgs((prev) => [
        ...prev,
        {
          id: userClientId,
          clientId: userClientId,
          role: "USER",
          content: text,
        },
        {
          id: `stream-${Date.now()}`,
          clientId: `stream-${Date.now()}`,
          role: "ASSISTANT",
          content: "",
        },
      ]);

      const token = await getToken();
      try {
        await streamChatMessage(
          {
            chatId,
            message: text,
            clientId: userClientId,
            forceWeb,
            token,
          },
          {
            onToken: (delta) => {
              setMsgs((prev) => {
                const copy = [...prev];
                const last = copy[copy.length - 1];
                if (last?.role === "ASSISTANT") {
                  copy[copy.length - 1] = {
                    ...last,
                    content: last.content + delta,
                  };
                }
                return copy;
              });
            },
            onDone: (data) => {
              setMsgs((prev) => {
                const copy = [...prev];
                copy[copy.length - 1] = {
                  id: data.messageId,
                  clientId: data.clientId,
                  role: "ASSISTANT",
                  content: data.content,
                  citations: data.citations,
                  webSources: data.webSources,
                  kind: data.kind,
                };
                return copy;
              });
              void upsertLocalMessage({
                id: data.messageId,
                chatId,
                clientId: data.clientId,
                role: "ASSISTANT",
                content: data.content,
                citationsJson: JSON.stringify(data.citations ?? []),
                webSourcesJson: JSON.stringify(data.webSources ?? []),
                kind: data.kind,
                createdAt: new Date().toISOString(),
                synced: 1,
              });
              void markSynced([userClientId]);
              if (data.kind === "not_in_notes") setOfferWeb(true);
              void qc.invalidateQueries(trpc.chat.get.queryFilter({ id: chatId }));
            },
            onError: (msg) => setError(msg),
          },
        );
      } catch (e) {
        setError(e instanceof Error ? e.message : "Send failed (queued offline)");
      } finally {
        setBusy(false);
      }
    },
    [busy, chatId, getToken, input, qc],
  );

  return (
    <View className="flex-1 bg-white dark:bg-slate-950">
      <FlatList
        className="flex-1 px-3"
        data={msgs}
        keyExtractor={(item) => item.id}
        contentContainerStyle={{ paddingVertical: 12, gap: 10 }}
        renderItem={({ item }) => (
          <View
            className={
              item.role === "USER"
                ? "ml-8 rounded-2xl bg-primary-600 px-3 py-2"
                : "mr-8 rounded-2xl border border-slate-200 bg-white px-3 py-2 dark:border-slate-800 dark:bg-slate-900"
            }
          >
            {item.role === "ASSISTANT" && item.kind === "web" ? (
              <Text className="mb-1 text-xs font-semibold uppercase text-amber-700">
                From the web · not your notes
              </Text>
            ) : null}
            {item.role === "ASSISTANT" ? (
              <Markdown>{item.content || "…"}</Markdown>
            ) : (
              <Text className="text-sm text-white">{item.content}</Text>
            )}
            {item.citations?.map((c) => (
              <Pressable
                key={`${c.documentId}-${c.pageNumber}`}
                onPress={() =>
                  router.push(`/library/${c.documentId}?page=${c.pageNumber}`)
                }
                className="mt-2 self-start rounded-full border border-primary-200 bg-primary-50 px-2 py-1"
              >
                <Text className="text-xs text-primary-700">
                  {c.title}, p. {c.pageNumber}
                </Text>
              </Pressable>
            ))}
            {item.webSources?.map((w) => (
              <Text key={w.url} className="mt-1 text-xs text-amber-800">
                Web: {w.title}
              </Text>
            ))}
          </View>
        )}
      />

      {error ? (
        <Text className="px-3 text-sm text-red-600">{error}</Text>
      ) : null}

      {offerWeb ? (
        <Pressable
          className="mx-3 mb-2 rounded-lg border border-amber-300 bg-amber-50 px-3 py-2"
          onPress={() => void send(true)}
          disabled={busy}
        >
          <Text className="text-sm text-amber-900">
            Not in notes — tap to search the web
          </Text>
        </Pressable>
      ) : null}

      <View className="flex-row items-center gap-2 border-t border-slate-200 px-3 py-2 dark:border-slate-800">
        <TextInput
          className="flex-1 rounded-xl border border-slate-300 px-3 py-2 text-slate-900 dark:border-slate-700 dark:text-slate-50"
          value={input}
          onChangeText={setInput}
          placeholder="Ask from your notes…"
          editable={!busy}
        />
        <Pressable
          onPress={() => void send(false)}
          disabled={busy || !input.trim()}
          className="rounded-xl bg-primary-600 px-4 py-2"
        >
          {busy ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text className="font-medium text-white">Send</Text>
          )}
        </Pressable>
      </View>
    </View>
  );
}
