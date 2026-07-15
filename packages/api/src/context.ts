import { db } from "@examgpt/db";
import type { StorageAdapter } from "./routers/documents";

/**
 * Inner context — shared by HTTP adapter, server-side callers, and tests.
 * Never requires raw req/res objects.
 */
export type CreateInnerContextOptions = {
  /** Clerk user id from verified JWT. Null for public calls. Never from client body. */
  userId?: string | null;
  /**
   * Role from Clerk JWT publicMetadata.role (server-verified claims).
   * Used with ADMIN_USER_IDS allowlist for adminProcedure.
   */
  role?: string | null;
  storage?: StorageAdapter | null;
  /** Optional event emitter for Inngest (injected by server). */
  emitEvent?: (name: string, data: Record<string, unknown>) => Promise<void>;
  /** Per-user page quota (INGEST_PAGE_QUOTA). */
  pageQuota?: number;
  /** Comma-separated or array of Clerk user ids allowed as admins. */
  adminUserIds?: string[] | string | null;
};

export async function createContextInner(opts: CreateInnerContextOptions = {}) {
  const adminUserIds = normalizeAdminUserIds(opts.adminUserIds);
  return {
    db,
    userId: opts.userId ?? null,
    role: opts.role ?? null,
    storage: opts.storage ?? null,
    emitEvent: opts.emitEvent,
    pageQuota: opts.pageQuota ?? 2000,
    adminUserIds,
  };
}

export function normalizeAdminUserIds(
  raw: string[] | string | null | undefined,
): string[] {
  if (raw == null) return [];
  if (Array.isArray(raw)) {
    return raw.map((s) => s.trim()).filter(Boolean);
  }
  return raw
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

/** Dual-gate admin check: publicMetadata.role === "admin" AND allowlist. */
export function isAdminUser(opts: {
  userId: string | null | undefined;
  role: string | null | undefined;
  adminUserIds: string[];
}): boolean {
  if (!opts.userId) return false;
  if (opts.role !== "admin") return false;
  if (!opts.adminUserIds.includes(opts.userId)) return false;
  return true;
}

export type Context = Awaited<ReturnType<typeof createContextInner>>;
