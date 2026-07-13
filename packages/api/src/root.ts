import { createTRPCRouter } from "./trpc";
import { healthRouter } from "./routers/health";
import { userRouter } from "./routers/user";
import { onboardingRouter } from "./routers/onboarding";
import { documentsRouter } from "./routers/documents";
import { notificationsRouter } from "./routers/notifications";

export const appRouter = createTRPCRouter({
  health: healthRouter,
  user: userRouter,
  onboarding: onboardingRouter,
  documents: documentsRouter,
  notifications: notificationsRouter,
});

export type AppRouter = typeof appRouter;
