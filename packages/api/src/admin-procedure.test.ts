import { describe, expect, it } from "vitest";
import { TRPCError } from "@trpc/server";
import { initTRPC } from "@trpc/server";
import { isAdminUser } from "./context";

/**
 * Integration-style unit test of adminProcedure gate behavior without DB.
 */
describe("adminProcedure FORBIDDEN paths", () => {
  type Ctx = {
    userId: string | null;
    role: string | null;
    adminUserIds: string[];
  };

  const t = initTRPC.context<Ctx>().create();
  const protectedProc = t.procedure.use(({ ctx, next }) => {
    if (!ctx.userId) throw new TRPCError({ code: "UNAUTHORIZED" });
    return next({ ctx: { ...ctx, userId: ctx.userId } });
  });
  const adminProc = protectedProc.use(({ ctx, next }) => {
    if (
      !isAdminUser({
        userId: ctx.userId,
        role: ctx.role,
        adminUserIds: ctx.adminUserIds,
      })
    ) {
      throw new TRPCError({
        code: "FORBIDDEN",
        message: "Admin access required",
      });
    }
    return next({ ctx });
  });

  const router = t.router({
    ping: adminProc.query(() => ({ ok: true as const })),
  });

  async function call(ctx: Ctx) {
    const caller = t.createCallerFactory(router)(ctx);
    return caller.ping();
  }

  it("non-admin role → FORBIDDEN", async () => {
    await expect(
      call({
        userId: "user_admin1",
        role: "user",
        adminUserIds: ["user_admin1"],
      }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("allowlist mismatch → FORBIDDEN", async () => {
    await expect(
      call({
        userId: "user_x",
        role: "admin",
        adminUserIds: ["user_admin1"],
      }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("both gates pass → ok", async () => {
    await expect(
      call({
        userId: "user_admin1",
        role: "admin",
        adminUserIds: ["user_admin1"],
      }),
    ).resolves.toEqual({ ok: true });
  });
});
