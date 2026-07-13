import { registerPushTokenInput } from "@examgpt/validators";
import { createTRPCRouter, protectedProcedure } from "../trpc";

export const notificationsRouter = createTRPCRouter({
  registerPushToken: protectedProcedure
    .input(registerPushTokenInput)
    .mutation(async ({ ctx, input }) => {
      await ctx.db.user.upsert({
        where: { id: ctx.userId },
        create: { id: ctx.userId },
        update: {},
      });

      const row = await ctx.db.pushToken.upsert({
        where: { token: input.token },
        create: {
          userId: ctx.userId,
          token: input.token,
          platform: input.platform,
        },
        update: {
          userId: ctx.userId,
          platform: input.platform,
        },
      });

      return { id: row.id, ok: true as const };
    }),
});
