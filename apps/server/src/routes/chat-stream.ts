import {
  generateChatTitle,
  runRagPipeline,
  type Citation,
  type WebSource,
} from "@examgpt/ai";
import { db } from "@examgpt/db";
import type { Prisma } from "@prisma/client";
import { getAuth } from "@clerk/express";
import type { Request, Response } from "express";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { clerkConfigured, env } from "../env";
import { hybridSearchStudyChunks } from "../qdrant/search";
import { inngest } from "../inngest/client";
import { logger } from "../logger";

/**
 * Streaming transport choice (Phase 3):
 * Plain Express SSE at POST /chat/stream, guarded by the same Clerk middleware
 * as tRPC — NOT tRPC subscriptions.
 *
 * Why: React Native needs Authorization headers on the stream request.
 * Native EventSource (used by tRPC httpSubscriptionLink) cannot set custom
 * headers without a polyfill; fetch()-based SSE works on web and Expo.
 * Documented in TASKS.md Phase 3 acceptance notes.
 */

const bodySchema = z.object({
  chatId: z.string().min(1).optional(),
  message: z.string().min(1).max(8000),
  clientId: z.string().uuid().optional(),
  forceWeb: z.boolean().optional(),
});

function writeSse(res: Response, event: string, data: unknown) {
  res.write(`event: ${event}\n`);
  res.write(`data: ${JSON.stringify(data)}\n\n`);
}

export async function chatStreamHandler(req: Request, res: Response) {
  let userId: string | null = null;
  if (clerkConfigured()) {
    try {
      const auth = getAuth(req);
      if (auth.isAuthenticated && auth.userId) userId = auth.userId;
    } catch {
      /* fall through */
    }
  } else if (env.NODE_ENV === "development") {
    const h = req.headers.authorization;
    if (typeof h === "string" && h.startsWith("Bearer user_")) {
      userId = h.slice("Bearer ".length);
    }
  }

  if (!userId) {
    res.status(401).json({ error: "UNAUTHORIZED" });
    return;
  }

  const parsed = bodySchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "BAD_REQUEST", details: parsed.error.flatten() });
    return;
  }

  const { message, forceWeb } = parsed.data;
  const clientId = parsed.data.clientId ?? randomUUID();

  res.setHeader("Content-Type", "text/event-stream; charset=utf-8");
  res.setHeader("Cache-Control", "no-cache, no-transform");
  res.setHeader("Connection", "keep-alive");
  res.flushHeaders?.();

  const ac = new AbortController();
  req.on("close", () => ac.abort());

  try {
    await db.user.upsert({
      where: { id: userId },
      create: { id: userId },
      update: {},
    });

    let chatId = parsed.data.chatId;
    let chatTitle = "New chat";
    if (chatId) {
      const existing = await db.chat.findFirst({
        where: { id: chatId, userId, deletedAt: null },
      });
      if (!existing) {
        writeSse(res, "error", { message: "Chat not found" });
        res.end();
        return;
      }
      chatTitle = existing.title;
    } else {
      const created = await db.chat.create({
        data: { userId, title: "New chat" },
      });
      chatId = created.id;
    }

    writeSse(res, "meta", { chatId });

    // Persist user message (idempotent by clientId)
    const userMsg = await db.message.upsert({
      where: { clientId },
      create: {
        chatId,
        clientId,
        role: "USER",
        content: message,
      },
      update: {},
    });
    writeSse(res, "user_message", {
      id: userMsg.id,
      clientId: userMsg.clientId,
      content: userMsg.content,
    });

    // Title after first exchange
    const priorCount = await db.message.count({ where: { chatId } });
    if (priorCount <= 1 || chatTitle === "New chat") {
      void generateChatTitle(message, userId)
        .then(async (title) => {
          await db.chat.update({ where: { id: chatId! }, data: { title } });
          writeSse(res, "title", { title });
        })
        .catch(() => undefined);
    }

    let streamed = "";
    const result = await runRagPipeline({
      userId,
      query: message,
      forceWeb: forceWeb ?? false,
      search: async ({ userId: uid, query, hydePassage, topK }) => {
        try {
          return await hybridSearchStudyChunks({
            userId: uid,
            query,
            hydePassage,
            topK,
          });
        } catch (err) {
          // Phase 7 chaos: Qdrant down → degrade with clear message, never crash stream
          logger.error({ err }, "Qdrant search failed — chat degraded");
          throw new Error(
            "Search is temporarily unavailable (knowledge index offline). Try again in a moment, or ask a general question after notes recovery.",
          );
        }
      },
      onToken: (delta) => {
        streamed += delta;
        writeSse(res, "token", { delta });
      },
      signal: ac.signal,
    });

    // Prefer validated final content over raw stream when different
    const finalContent =
      result.kind === "notes" && result.content
        ? result.content
        : result.content || streamed;

    const assistantClientId = randomUUID();
    const citations = result.citations as Citation[];
    const webSources = result.webSources as WebSource[];

    const assistant = await db.message.create({
      data: {
        chatId,
        clientId: assistantClientId,
        role: "ASSISTANT",
        content: finalContent,
        citations: citations.length
          ? (citations as unknown as Prisma.InputJsonValue)
          : undefined,
        webSources: webSources.length
          ? (webSources as unknown as Prisma.InputJsonValue)
          : undefined,
        kind: result.kind,
      },
    });

    await db.chat.update({
      where: { id: chatId },
      data: { updatedAt: new Date() },
    });

    // Fire-and-forget mem0 sync via Inngest
    try {
      await inngest.send({
        name: "chat/message_created",
        data: {
          userId,
          chatId,
          userContent: message,
          assistantContent: finalContent,
        },
      });
    } catch (err) {
      logger.warn({ err }, "failed to emit chat/message_created");
    }

    writeSse(res, "done", {
      messageId: assistant.id,
      clientId: assistant.clientId,
      content: finalContent,
      kind: result.kind,
      citations,
      webSources,
      meta: result.meta,
    });
    res.end();
  } catch (err) {
    logger.error({ err }, "chat stream failed");
    const msg = err instanceof Error ? err.message : "Chat failed";
    // Friendly copy when Postgres is down mid-request
    const friendly =
      /connect|ECONNREFUSED|Prisma|database/i.test(msg)
        ? "Service temporarily unavailable (database). Please retry shortly."
        : msg;
    try {
      writeSse(res, "error", { message: friendly });
    } catch {
      /* response may be closed */
    }
    res.end();
  }
}
