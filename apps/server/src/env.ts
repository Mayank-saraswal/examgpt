import { z } from "zod";

const envSchema = z.object({
  NODE_ENV: z
    .enum(["development", "test", "production"])
    .default("development"),
  PORT: z.coerce.number().default(4000),
  DATABASE_URL: z.string().min(1),
  CORS_ORIGINS: z
    .string()
    .default("http://localhost:3000,http://localhost:8081"),

  // Clerk
  CLERK_SECRET_KEY: z.string().optional(),
  CLERK_PUBLISHABLE_KEY: z.string().optional(),
  CLERK_WEBHOOK_SIGNING_SECRET: z.string().optional(),
  /** Comma-separated Clerk user ids allowed as admins (with publicMetadata.role=admin). */
  ADMIN_USER_IDS: z.string().optional(),

  // Inngest
  INNGEST_EVENT_KEY: z.string().optional(),
  INNGEST_SIGNING_KEY: z.string().optional(),

  // R2
  R2_ACCOUNT_ID: z.string().optional(),
  R2_ACCESS_KEY_ID: z.string().optional(),
  R2_SECRET_ACCESS_KEY: z.string().optional(),
  R2_BUCKET: z.string().optional(),
  R2_PUBLIC_BASE_URL: z.string().optional(),

  // Qdrant
  QDRANT_URL: z.string().default("http://localhost:6333"),
  QDRANT_API_KEY: z.string().optional(),

  // AI
  OPENAI_API_KEY: z.string().optional(),
  GOOGLE_GENERATIVE_AI_API_KEY: z.string().optional(),
  OPENROUTER_API_KEY: z.string().optional(),
  /** Per-user daily AI spend cap in USD (default 5). */
  AI_DAILY_BUDGET_USD: z.coerce.number().positive().default(5),

  // Ingest / exam guards
  INGEST_PAGE_QUOTA: z.coerce.number().int().positive().default(2000),
  /** Seconds after endsAt still accepting late events (default 5). */
  ATTEMPT_GRACE_SEC: z.coerce.number().int().nonnegative().default(5),
  /** Syllabus match score 0–1 below which paper needs review (default 0.35). */
  PAPER_SYLLABUS_MATCH_THRESHOLD: z.coerce.number().min(0).max(1).default(0.35),
});

export type ServerEnv = z.infer<typeof envSchema>;

function loadEnv(): ServerEnv {
  const parsed = envSchema.safeParse(process.env);
  if (!parsed.success) {
    console.error(
      "Invalid server environment:",
      parsed.error.flatten().fieldErrors,
    );
    throw new Error("Invalid server environment variables");
  }
  return parsed.data;
}

export const env = loadEnv();

export function corsOriginList(): string[] {
  return env.CORS_ORIGINS.split(",")
    .map((o) => o.trim())
    .filter(Boolean);
}

export function clerkConfigured(): boolean {
  return Boolean(env.CLERK_SECRET_KEY);
}
