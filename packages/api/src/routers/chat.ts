import { TRPCError } from "@trpc/server";
import type { Prisma } from "@prisma/client";
import { z } from "zod";
import { createTRPCRouter, protectedProcedure } from "../trpc";

const citationOut = z.object({
  documentId: z.string(),
  title: z.string(),
  pageNumber: z.number(),
  chunkId: z.string().optional(),
  score: z.number().optional(),
});

const webSourceOut = z.object({
  url: z.string(),
  title: z.string(),
});

const messageOut = z.object({
  id: z.string(),
  chatId: z.string(),
  clientId: z.string(),
  role: z.enum(["USER", "ASSISTANT"]),
  content: z.string(),
  citations: z.array(citationOut).nullable(),
  webSources: z.array(webSourceOut).nullable(),
  kind: z.string().nullable(),
  createdAt: z.date(),
});

export const chatRouter = createTRPCRouter({
  list: protectedProcedure.query(async ({ ctx }) => {
    return ctx.db.chat.findMany({
      where: { userId: ctx.userId, deletedAt: null },
      orderBy: { updatedAt: "desc" },
      select: {
        id: true,
        title: true,
        createdAt: true,
        updatedAt: true,
        messages: {
          orderBy: { createdAt: "desc" },
          take: 1,
          select: { content: true, role: true, createdAt: true },
        },
      },
    });
  }),

  create: protectedProcedure
    .input(
      z.object({
        title: z.string().min(1).max(120).optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      await ctx.db.user.upsert({
        where: { id: ctx.userId },
        create: { id: ctx.userId },
        update: {},
      });
      return ctx.db.chat.create({
        data: {
          userId: ctx.userId,
          title: input.title ?? "New chat",
        },
      });
    }),

  get: protectedProcedure
    .input(z.object({ id: z.string().min(1) }))
    .query(async ({ ctx, input }) => {
      const chat = await ctx.db.chat.findFirst({
        where: { id: input.id, userId: ctx.userId, deletedAt: null },
        include: {
          messages: { orderBy: { createdAt: "asc" } },
        },
      });
      if (!chat) throw new TRPCError({ code: "NOT_FOUND" });
      return chat;
    }),

  delete: protectedProcedure
    .input(z.object({ id: z.string().min(1) }))
    .mutation(async ({ ctx, input }) => {
      const chat = await ctx.db.chat.findFirst({
        where: { id: input.id, userId: ctx.userId, deletedAt: null },
      });
      if (!chat) throw new TRPCError({ code: "NOT_FOUND" });
      await ctx.db.chat.update({
        where: { id: chat.id },
        data: { deletedAt: new Date() },
      });
      return { ok: true as const };
    }),

  /**
   * Idempotent batch sync for local-first mobile (keyed by clientId).
   */
  syncMessages: protectedProcedure
    .input(
      z.object({
        chatId: z.string().min(1),
        messages: z
          .array(
            z.object({
              clientId: z.string().uuid(),
              role: z.enum(["USER", "ASSISTANT"]),
              content: z.string().min(1).max(50_000),
              citations: z.array(citationOut).optional(),
              webSources: z.array(webSourceOut).optional(),
              kind: z.string().optional(),
              createdAt: z.coerce.date().optional(),
            }),
          )
          .max(100),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const chat = await ctx.db.chat.findFirst({
        where: { id: input.chatId, userId: ctx.userId, deletedAt: null },
      });
      if (!chat) throw new TRPCError({ code: "NOT_FOUND" });

      const upserted: string[] = [];
      for (const m of input.messages) {
        const row = await ctx.db.message.upsert({
          where: { clientId: m.clientId },
          create: {
            chatId: chat.id,
            clientId: m.clientId,
            role: m.role,
            content: m.content,
            citations: (m.citations ??
              undefined) as Prisma.InputJsonValue | undefined,
            webSources: (m.webSources ??
              undefined) as Prisma.InputJsonValue | undefined,
            kind: m.kind,
            createdAt: m.createdAt ?? new Date(),
          },
          update: {
            // Idempotent: do not overwrite content on conflict
          },
        });
        upserted.push(row.id);
      }

      await ctx.db.chat.update({
        where: { id: chat.id },
        data: { updatedAt: new Date() },
      });

      return { ok: true as const, ids: upserted };
    }),

  /** Pull messages newer than cursor for mobile background sync. */
  pullMessages: protectedProcedure
    .input(
      z.object({
        chatId: z.string().min(1),
        after: z.coerce.date().optional(),
      }),
    )
    .query(async ({ ctx, input }) => {
      const chat = await ctx.db.chat.findFirst({
        where: { id: input.chatId, userId: ctx.userId, deletedAt: null },
      });
      if (!chat) throw new TRPCError({ code: "NOT_FOUND" });
      return ctx.db.message.findMany({
        where: {
          chatId: chat.id,
          ...(input.after ? { createdAt: { gt: input.after } } : {}),
        },
        orderBy: { createdAt: "asc" },
      });
    }),
});

export type ChatMessageOut = z.infer<typeof messageOut>;
