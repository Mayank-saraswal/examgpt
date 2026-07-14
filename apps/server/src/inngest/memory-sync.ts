import { addMemory } from "@examgpt/ai";
import { inngest } from "./client";
import { logger } from "../logger";

/**
 * chat/memory-sync — async mem0 write. Never blocks the chat stream.
 * mem0 outages degrade silently inside addMemory.
 */
export const chatMemorySync = inngest.createFunction(
  {
    id: "chat-memory-sync",
    retries: 2,
    concurrency: [{ limit: 5, key: "event.data.userId" }],
  },
  { event: "chat/message_created" },
  async ({ event, step }) => {
    const { userId, userContent, assistantContent } = event.data as {
      userId: string;
      chatId: string;
      userContent: string;
      assistantContent: string;
    };

    await step.run("mem0-add", async () => {
      await addMemory(userId, [
        { role: "user", content: userContent },
        { role: "assistant", content: assistantContent },
      ]);
      logger.info({ userId }, "mem0 memory sync attempted");
      return { ok: true };
    });

    return { ok: true };
  },
);
