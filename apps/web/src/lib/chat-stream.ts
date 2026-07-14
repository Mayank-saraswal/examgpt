import type { Citation, WebSource } from "@examgpt/ai";

export type StreamHandlers = {
  onMeta?: (data: { chatId: string }) => void;
  onToken?: (delta: string) => void;
  onTitle?: (title: string) => void;
  onDone?: (data: {
    messageId: string;
    clientId: string;
    content: string;
    kind: string;
    citations: Citation[];
    webSources: WebSource[];
  }) => void;
  onError?: (message: string) => void;
};

function getApiUrl() {
  return (
    process.env.NEXT_PUBLIC_API_URL ??
    process.env.API_URL ??
    "http://localhost:4000"
  );
}

/**
 * Fetch-based SSE client for POST /chat/stream (Authorization header supported).
 */
export async function streamChatMessage(
  opts: {
    chatId?: string;
    message: string;
    clientId?: string;
    forceWeb?: boolean;
    token: string | null;
    signal?: AbortSignal;
  },
  handlers: StreamHandlers,
): Promise<void> {
  const res = await fetch(`${getApiUrl()}/chat/stream`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(opts.token ? { Authorization: `Bearer ${opts.token}` } : {}),
    },
    body: JSON.stringify({
      chatId: opts.chatId,
      message: opts.message,
      clientId: opts.clientId,
      forceWeb: opts.forceWeb,
    }),
    signal: opts.signal,
  });

  if (!res.ok || !res.body) {
    const text = await res.text().catch(() => "");
    handlers.onError?.(text || `HTTP ${res.status}`);
    return;
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let eventName = "message";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const parts = buffer.split("\n");
    buffer = parts.pop() ?? "";

    for (const line of parts) {
      if (line.startsWith("event:")) {
        eventName = line.slice(6).trim();
      } else if (line.startsWith("data:")) {
        const raw = line.slice(5).trim();
        if (!raw) continue;
        try {
          const data = JSON.parse(raw) as Record<string, unknown>;
          if (eventName === "meta" && typeof data.chatId === "string") {
            handlers.onMeta?.({ chatId: data.chatId });
          } else if (eventName === "token" && typeof data.delta === "string") {
            handlers.onToken?.(data.delta);
          } else if (eventName === "title" && typeof data.title === "string") {
            handlers.onTitle?.(data.title);
          } else if (eventName === "done") {
            handlers.onDone?.(data as Parameters<NonNullable<StreamHandlers["onDone"]>>[0]);
          } else if (eventName === "error") {
            handlers.onError?.(String(data.message ?? "Stream error"));
          }
        } catch {
          /* ignore partial JSON */
        }
        eventName = "message";
      } else if (line === "") {
        eventName = "message";
      }
    }
  }
}
