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
import { ensureQuestionBankCollection } from "./qdrant/question-bank";
import { chatStreamHandler } from "./routes/chat-stream";
import { createPrismaUsageSink } from "./ai/usage-sink";
import { createLocalStorageRouter } from "./storage/local-routes";
import { shouldMountLocalStorageRoutes } from "./storage/local-routes-policy";
import { storageBackend } from "./storage";

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

// Dev-only local storage HTTP routes. Unauthenticated PUT accepts up to 110MB —
// NEVER mount in production (disk-fill DoS). See shouldMountLocalStorageRoutes.
const mountLocalStorage = shouldMountLocalStorageRoutes(
  env.NODE_ENV,
  storageBackend(),
);
if (env.NODE_ENV === "production" && mountLocalStorage) {
  throw new Error(
    "FATAL: /storage/local routes must not mount when NODE_ENV=production",
  );
}
if (mountLocalStorage) {
  app.use("/storage/local", createLocalStorageRouter());
  logger.warn(
    "Dev local storage routes mounted at /storage/local (NODE_ENV=development, backend=local)",
  );
} else {
  logger.info(
    {
      nodeEnv: env.NODE_ENV,
      storageBackend: storageBackend(),
    },
    "/storage/local routes not mounted",
  );
}

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
  void ensureQuestionBankCollection()
    .then(() => logger.info("Qdrant question_bank asserted at boot"))
    .catch((err) =>
      logger.error({ err }, "Qdrant question_bank boot assert failed"),
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
      storageBackend: storageBackend(),
      localStorageRoutes: mountLocalStorage,
    },
    "ExamGPT server listening",
  );
});
