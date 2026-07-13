import { db } from "@examgpt/db";

/**
 * Inner context — shared by HTTP adapter, server-side callers, and tests.
 * Never requires raw req/res objects.
 */
export type CreateInnerContextOptions = {
  /** Clerk user id once auth lands (Phase 1). Null for public calls. */
  userId?: string | null;
};

export async function createContextInner(opts: CreateInnerContextOptions = {}) {
  return {
    db,
    userId: opts.userId ?? null,
  };
}

export type Context = Awaited<ReturnType<typeof createContextInner>>;
