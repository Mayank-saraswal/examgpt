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
    modelId: "anthropic/claude-sonnet-4",
    provider: "openrouter",
  },
  "report-analysis": {
    task: "report-analysis",
    modelId: "anthropic/claude-sonnet-4",
    provider: "openrouter",
  },
  "paper-generation": {
    task: "paper-generation",
    modelId: "anthropic/claude-sonnet-4",
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
  "report-analysis": "AI_MODEL_REPORT",
  "paper-generation": "AI_MODEL_PAPERGEN",
  "web-search": "AI_MODEL_WEBSEARCH",
  "title-gen": "AI_MODEL_TITLE",
};

/** Runtime overrides after OpenRouter catalog validation (task → modelId). */
const runtimeOverrides = new Map<AiTask, string>();

export function getDefaultModelId(task: AiTask): string {
  return defaults[task].modelId;
}

export function getModelConfig(task: AiTask): ModelConfig {
  const base = defaults[task];
  const envOverride = process.env[envKey[task]];
  const runtime = runtimeOverrides.get(task);
  const modelId = runtime ?? envOverride ?? base.modelId;
  return { ...base, modelId };
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
