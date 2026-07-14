import { createTRPCRouter } from "./trpc";
import { healthRouter } from "./routers/health";
import { userRouter } from "./routers/user";
import { onboardingRouter } from "./routers/onboarding";
import { documentsRouter } from "./routers/documents";
import { notificationsRouter } from "./routers/notifications";
import { chatRouter } from "./routers/chat";
import { testsRouter } from "./routers/tests";
import { attemptsRouter } from "./routers/attempts";
import { reportsRouter } from "./routers/reports";

export const appRouter = createTRPCRouter({
  health: healthRouter,
  user: userRouter,
  onboarding: onboardingRouter,
  documents: documentsRouter,
  notifications: notificationsRouter,
  chat: chatRouter,
  tests: testsRouter,
  attempts: attemptsRouter,
  reports: reportsRouter,
});

export type AppRouter = typeof appRouter;
