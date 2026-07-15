/**
 * Client-safe exports.
 * Server-only context helpers live at `@examgpt/api/context`.
 */
export { appRouter, type AppRouter } from "./root";
export {
  createTRPCRouter,
  createCallerFactory,
  publicProcedure,
  protectedProcedure,
  adminProcedure,
} from "./trpc";
export { isAdminUser, normalizeAdminUserIds } from "./context";
export type { StorageAdapter } from "./routers/documents";
