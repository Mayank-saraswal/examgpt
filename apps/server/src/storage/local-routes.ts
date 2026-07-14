import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import express, { type Router } from "express";
import { logger } from "../logger";
import { localPathForKey, writeLocalObject } from "./local";

export { shouldMountLocalStorageRoutes } from "./local-routes-policy";

function fileKeyFromSplat(req: express.Request): string | null {
  const splat = (req.params as { splat?: string | string[] }).splat;
  const raw = Array.isArray(splat)
    ? splat.join("/")
    : (splat ?? req.path.replace(/^\//, ""));
  try {
    const fileKey = decodeURIComponent(raw);
    if (!fileKey || fileKey.includes("..")) return null;
    return fileKey;
  } catch {
    return null;
  }
}

/** Build the Express router for /storage/local (call only when shouldMount is true). */
export function createLocalStorageRouter(): Router {
  const localStorageRouter = express.Router();

  localStorageRouter.put(
    "/*splat",
    express.raw({ type: "*/*", limit: "110mb" }),
    (req, res) => {
      void (async () => {
        try {
          const fileKey = fileKeyFromSplat(req);
          if (!fileKey) {
            res.status(400).json({ error: "bad key" });
            return;
          }
          const body = Buffer.isBuffer(req.body)
            ? req.body
            : Buffer.from((req.body as ArrayBuffer) ?? []);
          await writeLocalObject(fileKey, body);
          res.status(200).json({ ok: true, key: fileKey, bytes: body.length });
        } catch (err) {
          logger.error({ err }, "local storage put failed");
          res.status(500).json({ error: "put failed" });
        }
      })();
    },
  );

  localStorageRouter.get("/*splat", (req, res) => {
    void (async () => {
      try {
        const fileKey = fileKeyFromSplat(req);
        if (!fileKey) {
          res.status(400).end();
          return;
        }
        const path = localPathForKey(fileKey);
        const s = await stat(path);
        res.setHeader("Content-Type", "application/pdf");
        res.setHeader("Content-Length", String(s.size));
        createReadStream(path).pipe(res);
      } catch {
        res.status(404).end();
      }
    })();
  });

  return localStorageRouter;
}
