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
import {
  chatStreamRateLimit,
  globalRateLimit,
  requestIdMiddleware,
  securityHeaders,
} from "./middleware/security";
import { captureException, initSentry } from "./observability/sentry";
import { db } from "@examgpt/db";
import { getQdrant } from "./qdrant/client";

initSentry();

const app = express();

// Phase 7 — request IDs + security headers + global rate limit
app.use(requestIdMiddleware);
app.use(securityHeaders);
app.use(globalRateLimit);

app.use(
  pinoHttp({
    logger,
    autoLogging: env.NODE_ENV !== "test",
    customProps(req) {
      return { requestId: req.headers["x-request-id"] };
    },
  }),
);

// Request size caps (chat/inngest override with their own limits)
app.use(express.json({ limit: "1mb" }));
app.use(express.urlencoded({ extended: false, limit: "1mb" }));

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

/**
 * Liveness/readiness. Returns 503 if Postgres is unreachable (chaos / load balancers).
 * Qdrant is reported but non-fatal for /health — chat degrades separately.
 */
app.get("/health", async (_req, res) => {
  let dbOk = false;
  let qdrantOk = false;
  try {
    await db.$queryRaw`SELECT 1`;
    dbOk = true;
  } catch (err) {
    logger.error({ err }, "health: postgres down");
  }
  try {
    await getQdrant().getCollections();
    qdrantOk = true;
  } catch (err) {
    logger.warn({ err }, "health: qdrant unreachable");
  }
  const ok = dbOk;
  res.status(ok ? 200 : 503).json({
    ok,
    service: "examgpt-server",
    clerk: clerkConfigured(),
    postgres: dbOk ? "up" : "down",
    qdrant: qdrantOk ? "up" : "down",
    qdrantUrl: env.QDRANT_URL,
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
  chatStreamRateLimit,
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
      captureException(error, { path, source: "trpc" });
    },
  }),
);

// Do NOT rate-limit /api/inngest — each step.run is a separate HTTP call;
// throttling here stalls multi-page OCR pipelines.
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
