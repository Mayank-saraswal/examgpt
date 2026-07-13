import { appRouter } from "@examgpt/api";
import * as trpcExpress from "@trpc/server/adapters/express";
import cors from "cors";
import express from "express";
import { serve } from "inngest/express";
import { pinoHttp } from "pino-http";
import { createContext } from "./context";
import { corsOriginList, env } from "./env";
import { functions } from "./inngest/functions";
import { inngest } from "./inngest/client";
import { logger } from "./logger";

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
      // Allow non-browser clients (no Origin) and configured app origins
      if (!origin || allowed.includes(origin)) {
        callback(null, true);
        return;
      }
      callback(new Error(`CORS blocked origin: ${origin}`));
    },
    credentials: true,
  }),
);

app.get("/health", (_req, res) => {
  res.json({
    ok: true,
    service: "examgpt-server",
    timestamp: new Date().toISOString(),
  });
});

// Do not mount express.json() globally before tRPC — it can break body parsing.
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

// Inngest serve endpoint (dev: `npx inngest-cli@latest dev`)
app.use(
  "/api/inngest",
  // Body parser only for Inngest routes
  express.json(),
  serve({
    client: inngest,
    functions,
  }),
);

app.listen(env.PORT, () => {
  logger.info(
    { port: env.PORT, cors: corsOriginList() },
    "ExamGPT server listening",
  );
});
