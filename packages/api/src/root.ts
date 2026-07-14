import { createTRPCRouter } from "./trpc";
import { healthRouter } from "./routers/health";
import { userRouter } from "./routers/user";
import { onboardingRouter } from "./routers/onboarding";
import { documentsRouter } from "./routers/documents";
import { notificationsRouter } from "./routers/notifications";
import { chatRouter } from "./routers/chat";

export const appRouter = createTRPCRouter({
  health: healthRouter,
  user: userRouter,
  onboarding: onboardingRouter,
  documents: documentsRouter,
  notifications: notificationsRouter,
  chat: chatRouter,
});

export type AppRouter = typeof appRouter;
