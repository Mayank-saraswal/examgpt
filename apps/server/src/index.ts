import { appRouter } from "@examgpt/api";
import { setUsageSink, validateOpenRouterModels } from "@examgpt/ai";
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
import { ensureStudyChunksCollection } from "./qdrant/client";
import { chatStreamHandler } from "./routes/chat-stream";
import { createPrismaUsageSink } from "./ai/usage-sink";

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

if (clerkConfigured()) {
  app.use(clerkMiddleware());
}

app.get("/health", (_req, res) => {
  res.json({
    ok: true,
    service: "examgpt-server",
    clerk: clerkConfigured(),
    qdrant: env.QDRANT_URL,
    timestamp: new Date().toISOString(),
  });
});

app.post(
  "/webhooks/clerk",
  express.raw({ type: "application/json" }),
  (req, res) => {
    void clerkWebhookHandler(req, res);
  },
);

// JSON body for chat stream + inngest (tRPC uses its own parser)
app.post(
  "/chat/stream",
  express.json({ limit: "1mb" }),
  (req, res) => {
    void chatStreamHandler(req, res);
  },
);

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

app.use(
  "/api/inngest",
  express.json({ limit: "4mb" }),
  serve({
    client: inngest,
    functions,
  }),
);

// Wire AiUsageLog sink (per-user daily budget via AI_DAILY_BUDGET_USD)
setUsageSink(createPrismaUsageSink());

app.listen(env.PORT, () => {
  void ensureStudyChunksCollection()
    .then(() => logger.info("Qdrant study_chunks asserted at boot"))
    .catch((err) =>
      logger.error({ err }, "Qdrant boot assert failed — check QDRANT_URL"),
    );

  // Non-fatal OpenRouter catalog validation → fall back to registry defaults
  void validateOpenRouterModels({
    log: (msg, extra) => logger.warn(extra ?? {}, msg),
  }).then((r) => {
    if (r.networkError) {
      logger.warn({ err: r.networkError }, "OpenRouter validation skipped");
    } else if (r.missing.length) {
      logger.warn(
        { missing: r.missing },
        "OpenRouter models missing — fell back to defaults",
      );
    } else {
      logger.info({ checked: r.checked }, "OpenRouter model IDs validated");
    }
  });

  logger.info(
    {
      port: env.PORT,
      cors: corsOriginList(),
      clerk: clerkConfigured(),
      pageQuota: env.INGEST_PAGE_QUOTA,
    },
    "ExamGPT server listening",
  );
});
