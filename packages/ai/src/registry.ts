/**
 * Model registry — single place for task → model mapping.
 * Never hardcode model IDs outside this file.
 */

export type AiTask =
  | "ocr"
  | "vision-extract"
  | "embedding"
  | "chat-rag"
  | "intent-agent"
  | "explain"
  | "explain-vision"
  | "report-analysis"
  | "paper-generation"
  | "web-search"
  | "title-gen";

export type ModelConfig = {
  task: AiTask;
  /** Provider model id — overridable via AI_MODEL_* env vars */
  modelId: string;
  provider: "openai" | "google" | "openrouter";
};

const defaults: Record<AiTask, ModelConfig> = {
  ocr: {
    task: "ocr",
    modelId: "gemini-3.5-flash",
    provider: "google",
  },
  "vision-extract": {
    task: "vision-extract",
    modelId: "gemini-3.5-flash",
    provider: "google",
  },
  embedding: {
    task: "embedding",
    modelId: "text-embedding-3-large",
    provider: "openai",
  },
  "chat-rag": {
    task: "chat-rag",
    modelId: "gpt-4.1",
    provider: "openai",
  },
  "intent-agent": {
    task: "intent-agent",
    modelId: "z-ai/glm-5.2",
    provider: "openrouter",
  },
  explain: {
    task: "explain",
    modelId: "z-ai/glm-5.2",
    provider: "openrouter",
  },
  "explain-vision": {
    task: "explain-vision",
    modelId: "anthropic/claude-sonnet-5",
    provider: "openrouter",
  },
  "report-analysis": {
    task: "report-analysis",
    modelId: "x-ai/grok-4.5",
    provider: "openrouter",
  },
  "paper-generation": {
    task: "paper-generation",
    modelId: "anthropic/claude-sonnet-5",
    provider: "openrouter",
  },
  "web-search": {
    task: "web-search",
    modelId: "perplexity/sonar-pro-search",
    provider: "openrouter",
  },
  "title-gen": {
    task: "title-gen",
    modelId: "gpt-4.1-mini",
    provider: "openai",
  },
};

const envKey: Record<AiTask, string> = {
  ocr: "AI_MODEL_OCR",
  "vision-extract": "AI_MODEL_VISION_EXTRACT",
  embedding: "AI_MODEL_EMBEDDING",
  "chat-rag": "AI_MODEL_CHAT",
  "intent-agent": "AI_MODEL_INTENT",
  explain: "AI_MODEL_EXPLAIN",
  "explain-vision": "AI_MODEL_EXPLAIN_VISION",
  "report-analysis": "AI_MODEL_REPORT",
  "paper-generation": "AI_MODEL_PAPERGEN",
  "web-search": "AI_MODEL_WEBSEARCH",
  "title-gen": "AI_MODEL_TITLE",
};

/** Runtime overrides after OpenRouter catalog validation (task → modelId). */
const runtimeOverrides = new Map<AiTask, string>();

/** Optional explicit provider env (e.g. AI_PROVIDER_OCR=openai). */
const providerEnvKey: Record<AiTask, string> = {
  ocr: "AI_PROVIDER_OCR",
  "vision-extract": "AI_PROVIDER_VISION_EXTRACT",
  embedding: "AI_PROVIDER_EMBEDDING",
  "chat-rag": "AI_PROVIDER_CHAT",
  "intent-agent": "AI_PROVIDER_INTENT",
  explain: "AI_PROVIDER_EXPLAIN",
  "explain-vision": "AI_PROVIDER_EXPLAIN_VISION",
  "report-analysis": "AI_PROVIDER_REPORT",
  "paper-generation": "AI_PROVIDER_PAPERGEN",
  "web-search": "AI_PROVIDER_WEBSEARCH",
  "title-gen": "AI_PROVIDER_TITLE",
};

/**
 * When AI_MODEL_* overrides the model id, also switch provider so ocr/vision
 * can move google→openai without changing registry defaults.
 */
export function inferProviderFromModelId(
  modelId: string,
  fallback: ModelConfig["provider"],
  explicit?: string | undefined,
): ModelConfig["provider"] {
  const e = explicit?.trim().toLowerCase();
  if (e === "openai" || e === "google" || e === "openrouter") return e;

  const id = modelId.trim().toLowerCase();
  if (!id) return fallback;
  // OpenRouter ids are vendor/model
  if (id.includes("/")) return "openrouter";
  if (id.startsWith("gemini") || id.includes("gemini-")) return "google";
  if (
    id.startsWith("gpt-") ||
    id.startsWith("o1") ||
    id.startsWith("o3") ||
    id.startsWith("o4") ||
    id.startsWith("chatgpt") ||
    id.startsWith("text-embedding")
  ) {
    return "openai";
  }
  return fallback;
}

export function getDefaultModelId(task: AiTask): string {
  return defaults[task].modelId;
}

export function getModelConfig(task: AiTask): ModelConfig {
  const base = defaults[task];
  const envOverride = process.env[envKey[task]]?.trim();
  const runtime = runtimeOverrides.get(task);
  const modelId = runtime ?? envOverride ?? base.modelId;
  // Only re-infer provider when model id was overridden (env or runtime)
  const modelWasOverridden = Boolean(runtime ?? envOverride);
  const provider = modelWasOverridden
    ? inferProviderFromModelId(
        modelId,
        base.provider,
        process.env[providerEnvKey[task]],
      )
    : base.provider;
  return { ...base, modelId, provider };
}

export function setRuntimeModelOverride(task: AiTask, modelId: string): void {
  runtimeOverrides.set(task, modelId);
}

export function clearRuntimeModelOverrides(): void {
  runtimeOverrides.clear();
}

export function listTasks(): AiTask[] {
  return Object.keys(defaults) as AiTask[];
}

export function listOpenRouterTasks(): AiTask[] {
  return listTasks().filter((t) => defaults[t].provider === "openrouter");
}

export function getAllDefaults(): Record<AiTask, ModelConfig> {
  return { ...defaults };
}

/** Route text vs vision explanations by presence of image keys. */
export function selectExplainTask(imageKeys: string[] | undefined | null): "explain" | "explain-vision" {
  return imageKeys && imageKeys.length > 0 ? "explain-vision" : "explain";
}
