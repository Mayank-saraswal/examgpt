import Constants from "expo-constants";
import { Platform } from "react-native";

function getApiUrl() {
  const fromEnv = process.env["EXPO_PUBLIC_API_URL"];
  if (fromEnv) return fromEnv;
  const hostUri =
    Constants.expoConfig?.hostUri ??
    Constants.linkingUri?.replace(/^exp:\/\//, "");
  const host = hostUri?.split(":")[0];
  if (Platform.OS === "android") return "http://10.0.2.2:4000";
  if (host && host !== "localhost") return `http://${host}:4000`;
  return "http://localhost:4000";
}

export type StreamHandlers = {
  onMeta?: (data: { chatId: string }) => void;
  onToken?: (delta: string) => void;
  onTitle?: (title: string) => void;
  onDone?: (data: {
    messageId: string;
    clientId: string;
    content: string;
    kind: string;
    citations: {
      documentId: string;
      title: string;
      pageNumber: number;
    }[];
    webSources: { url: string; title: string }[];
  }) => void;
  onError?: (message: string) => void;
};

export async function streamChatMessage(
  opts: {
    chatId?: string;
    message: string;
    clientId?: string;
    forceWeb?: boolean;
    token: string | null;
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
      if (line.startsWith("event:")) eventName = line.slice(6).trim();
      else if (line.startsWith("data:")) {
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
            handlers.onDone?.(
              data as Parameters<NonNullable<StreamHandlers["onDone"]>>[0],
            );
          } else if (eventName === "error") {
            handlers.onError?.(String(data.message ?? "Stream error"));
          }
        } catch {
          /* ignore */
        }
        eventName = "message";
      }
    }
  }
}
