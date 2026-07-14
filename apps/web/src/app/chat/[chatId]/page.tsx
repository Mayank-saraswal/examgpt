"use client";

import { useAuth } from "@clerk/nextjs";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useCallback, useMemo, useRef, useState } from "react";
import { ArrowLeft, Loader2, Send, Globe } from "lucide-react";
import { useTRPC } from "@/trpc/client";
import { buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ChatMarkdown } from "@/components/chat-markdown";
import {
  CitationPills,
  type PillCitation,
  type PillWebSource,
} from "@/components/citation-pills";
import { streamChatMessage } from "@/lib/chat-stream";
import { cn } from "@/lib/utils";

type LocalMsg = {
  id: string;
  clientId?: string;
  role: "USER" | "ASSISTANT";
  content: string;
  citations?: PillCitation[] | null;
  webSources?: PillWebSource[] | null;
  kind?: string | null;
  streaming?: boolean;
};

function asCitations(v: unknown): PillCitation[] | null {
  return Array.isArray(v) ? (v as PillCitation[]) : null;
}

function asWebSources(v: unknown): PillWebSource[] | null {
  return Array.isArray(v) ? (v as PillWebSource[]) : null;
}

export default function ChatThreadPage() {
  const { chatId } = useParams<{ chatId: string }>();
  const { isSignedIn, isLoaded, getToken } = useAuth();
  const trpc = useTRPC();
  const qc = useQueryClient();
  const [input, setInput] = useState("");
  const [pending, setPending] = useState<LocalMsg[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [offerWeb, setOfferWeb] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);

  const chat = useQuery({
    ...trpc.chat.get.queryOptions({ id: chatId }),
    enabled: isLoaded && !!isSignedIn && !!chatId,
  });

  const messages = chat.data?.messages;
  const serverMsgs: LocalMsg[] = useMemo(() => {
    if (!messages) return [];
    const raw = JSON.parse(JSON.stringify(messages)) as {
      id: string;
      clientId: string;
      role: "USER" | "ASSISTANT";
      content: string;
      citations: unknown;
      webSources: unknown;
      kind: string | null;
    }[];
    return raw.map((m) => ({
      id: m.id,
      clientId: m.clientId,
      role: m.role,
      content: m.content,
      citations: asCitations(m.citations),
      webSources: asWebSources(m.webSources),
      kind: m.kind,
    }));
  }, [messages]);

  const local = pending.length > 0 ? [...serverMsgs, ...pending] : serverMsgs;

  const send = useCallback(
    async (forceWeb = false) => {
      const text = input.trim();
      if (!text || busy) return;
      setError(null);
      setOfferWeb(false);
      setBusy(true);
      setInput("");

      const userTempId = `local-u-${Date.now()}`;
      const asstTempId = `local-a-${Date.now()}`;
      setPending([
        { id: userTempId, role: "USER", content: text },
        {
          id: asstTempId,
          role: "ASSISTANT",
          content: "",
          streaming: true,
        },
      ]);

      const token = await getToken();
      try {
        await streamChatMessage(
          {
            chatId,
            message: text,
            forceWeb,
            token,
          },
          {
            onToken: (delta) => {
              setPending((prev) =>
                prev.map((m) =>
                  m.id === asstTempId
                    ? { ...m, content: m.content + delta }
                    : m,
                ),
              );
            },
            onDone: (data) => {
              setPending([]);
              if (data.kind === "not_in_notes") setOfferWeb(true);
              void qc.invalidateQueries(
                trpc.chat.get.queryFilter({ id: chatId }),
              );
              void qc.invalidateQueries(trpc.chat.list.queryFilter());
            },
            onError: (msg) => setError(msg),
          },
        );
      } catch (e) {
        setError(e instanceof Error ? e.message : "Send failed");
      } finally {
        setBusy(false);
      }
    },
    [busy, chatId, getToken, input, qc, trpc.chat.get, trpc.chat.list],
  );

  return (
    <div className="mx-auto flex h-[100dvh] w-full max-w-3xl flex-col px-4 py-4">
      <header className="flex items-center gap-3 border-b border-[var(--eg-border)] pb-3">
        <Link
          href="/chat"
          className={cn(buttonVariants({ variant: "ghost", size: "icon" }))}
        >
          <ArrowLeft className="size-4" />
        </Link>
        <div className="min-w-0 flex-1">
          <h1 className="truncate text-lg font-semibold">
            {chat.data?.title ?? "Chat"}
          </h1>
          <p className="text-xs text-[var(--eg-muted-fg)]">
            Answers cite your notes · web results labeled separately
          </p>
        </div>
      </header>

      <div className="flex-1 space-y-4 overflow-y-auto py-4">
        {local.map((m) => (
          <div
            key={m.id}
            className={cn(
              "max-w-[90%] rounded-2xl px-4 py-3",
              m.role === "USER"
                ? "ml-auto bg-[var(--eg-primary)] text-white"
                : "mr-auto border border-[var(--eg-border)] bg-[var(--eg-surface)]",
            )}
          >
            {m.role === "ASSISTANT" && m.kind === "web" && (
              <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-amber-700 dark:text-amber-300">
                From the web · not your notes
              </p>
            )}
            {m.role === "ASSISTANT" ? (
              <ChatMarkdown content={m.content || (m.streaming ? "…" : "")} />
            ) : (
              <p className="text-sm whitespace-pre-wrap">{m.content}</p>
            )}
            {m.role === "ASSISTANT" && (
              <CitationPills
                citations={m.citations}
                webSources={m.webSources}
              />
            )}
          </div>
        ))}
        <div ref={bottomRef} />
      </div>

      {error && (
        <p className="mb-2 text-sm text-red-600" role="alert">
          {error}
        </p>
      )}

      {offerWeb && (
        <div className="mb-2 flex items-center justify-between gap-2 rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-sm dark:border-amber-800 dark:bg-amber-950">
          <span>Not in your notes. Search the web?</span>
          <button
            type="button"
            className={cn(buttonVariants({ size: "sm" }), "gap-1")}
            disabled={busy}
            onClick={() => {
              const lastUser = [...local]
                .reverse()
                .find((m) => m.role === "USER");
              if (lastUser) setInput(lastUser.content);
              void send(true);
            }}
          >
            <Globe className="size-3.5" />
            Search web
          </button>
        </div>
      )}

      <form
        className="flex gap-2 border-t border-[var(--eg-border)] pt-3"
        onSubmit={(e) => {
          e.preventDefault();
          void send(false);
        }}
      >
        <Input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Ask from your notes…"
          disabled={!isSignedIn || busy}
          className="flex-1"
        />
        <button
          type="submit"
          disabled={!isSignedIn || busy || !input.trim()}
          className={cn(buttonVariants({ variant: "default" }), "gap-1")}
        >
          {busy ? (
            <Loader2 className="size-4 animate-spin" />
          ) : (
            <Send className="size-4" />
          )}
          Send
        </button>
      </form>
    </div>
  );
}
