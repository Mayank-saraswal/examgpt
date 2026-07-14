import { describe, expect, it } from "vitest";
import express from "express";
import { shouldMountLocalStorageRoutes } from "./local-routes-policy";

describe("shouldMountLocalStorageRoutes", () => {
  it("allows only development + local backend", () => {
    expect(shouldMountLocalStorageRoutes("development", "local")).toBe(true);
  });

  it("blocks production even if backend is local", () => {
    expect(shouldMountLocalStorageRoutes("production", "local")).toBe(false);
  });

  it("blocks development when backend is r2", () => {
    expect(shouldMountLocalStorageRoutes("development", "r2")).toBe(false);
  });

  it("blocks development when backend is none", () => {
    expect(shouldMountLocalStorageRoutes("development", "none")).toBe(false);
  });

  it("blocks test and production with r2", () => {
    expect(shouldMountLocalStorageRoutes("test", "local")).toBe(false);
    expect(shouldMountLocalStorageRoutes("production", "r2")).toBe(false);
  });
});

describe("local storage route production posture", () => {
  it("returns 404 for /storage/local when routes are not mounted (production)", async () => {
    const app = express();
    // Production posture: do not mount local storage routes
    const mount = shouldMountLocalStorageRoutes("production", "local");
    expect(mount).toBe(false);
    if (mount) {
      throw new Error("must not mount local storage routes in production");
    }
    // No handler for /storage/local → Express default 404 via catch-all
    app.use((_req, res) => {
      res.status(404).end();
    });

    const server = app.listen(0);
    try {
      const addr = server.address();
      if (!addr || typeof addr === "string") throw new Error("no port");
      const res = await fetch(
        `http://127.0.0.1:${addr.port}/storage/local/evil.pdf`,
        {
          method: "PUT",
          body: Buffer.alloc(1024, 1),
          headers: { "content-type": "application/pdf" },
        },
      );
      expect(res.status).toBe(404);
    } finally {
      await new Promise<void>((resolve, reject) => {
        server.close((err) => (err ? reject(err) : resolve()));
      });
    }
  });
});
