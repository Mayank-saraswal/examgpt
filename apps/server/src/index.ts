import { appRouter } from "@examgpt/api";
import { clerkMiddleware } from "@clerk/express";
import * as trpcExpress from "@trpc/server/adapters/express";
import cors from "cors";
import express from "express";
import { serve } from "inngest/express";
import { pinoHttp } from "pino-http";
import { createContext } from "./context";
import { clerkConfigured, corsOriginList, env } from "./env";
import { functions } from "./inngest/functions";
import { inngest } from "./inngest/client";
import { logger } from "./logger";
import { clerkWebhookHandler } from "./webhooks/clerk";

const app = express();

app.use(
  pinoHttp({
    logger,
    autoLogging: env.NODE_ENV !== "test",
  }),
);

app.use(
  cors({
    origin(origin, callback) {
      const allowed = corsOriginList();
      if (!origin || allowed.includes(origin)) {
        callback(null, true);
        return;
      }
      callback(new Error(`CORS blocked origin: ${origin}`));
    },
    credentials: true,
  }),
);

// Clerk attaches auth to req when configured
// @see https://clerk.com/docs/references/express/overview
if (clerkConfigured()) {
  app.use(clerkMiddleware());
}

app.get("/health", (_req, res) => {
  res.json({
    ok: true,
    service: "examgpt-server",
    clerk: clerkConfigured(),
    timestamp: new Date().toISOString(),
  });
});

// Clerk webhooks need raw body for Svix verification
app.post(
  "/webhooks/clerk",
  express.raw({ type: "application/json" }),
  (req, res) => {
    void clerkWebhookHandler(req, res);
  },
);

// Do not mount express.json() globally before tRPC
app.use(
  "/trpc",
  trpcExpress.createExpressMiddleware({
    router: appRouter,
    createContext,
    onError({ error, path }) {
      logger.error({ err: error, path }, "tRPC error");
    },
  }),
);

// Inngest serve endpoint
app.use(
  "/api/inngest",
  express.json(),
  serve({
    client: inngest,
    functions,
  }),
);

app.listen(env.PORT, () => {
  logger.info(
    {
      port: env.PORT,
      cors: corsOriginList(),
      clerk: clerkConfigured(),
    },
    "ExamGPT server listening",
  );
});
