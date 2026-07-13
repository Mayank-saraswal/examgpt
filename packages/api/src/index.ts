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
} from "./trpc";
