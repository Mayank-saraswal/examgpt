import { db } from "@examgpt/db";
import type { StorageAdapter } from "./routers/documents";

/**
 * Inner context — shared by HTTP adapter, server-side callers, and tests.
 * Never requires raw req/res objects.
 */
export type CreateInnerContextOptions = {
  /** Clerk user id from verified JWT. Null for public calls. Never from client body. */
  userId?: string | null;
  storage?: StorageAdapter | null;
  /** Optional event emitter for Inngest (injected by server). */
  emitEvent?: (name: string, data: Record<string, unknown>) => Promise<void>;
};

export async function createContextInner(opts: CreateInnerContextOptions = {}) {
  return {
    db,
    userId: opts.userId ?? null,
    storage: opts.storage ?? null,
    emitEvent: opts.emitEvent,
  };
}

export type Context = Awaited<ReturnType<typeof createContextInner>>;
