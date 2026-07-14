import { createOpenAI } from "@ai-sdk/openai";
import { createGoogleGenerativeAI } from "@ai-sdk/google";
import { createOpenRouter } from "@openrouter/ai-sdk-provider";
import type { LanguageModel } from "ai";
import { getModelConfig, type AiTask } from "./registry";

/**
 * Resolve a LanguageModel for a registry task.
 * OpenAI direct / Google direct / OpenRouter.
 */
export function getLanguageModel(task: AiTask): LanguageModel {
  const cfg = getModelConfig(task);

  if (cfg.provider === "openai") {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      throw new Error(`OPENAI_API_KEY required for task ${task}`);
    }
    const openai = createOpenAI({ apiKey });
    return openai(cfg.modelId);
  }

  if (cfg.provider === "openrouter") {
    const apiKey = process.env.OPENROUTER_API_KEY;
    if (!apiKey) {
      throw new Error(`OPENROUTER_API_KEY required for task ${task}`);
    }
    const openrouter = createOpenRouter({ apiKey });
    return openrouter(cfg.modelId);
  }

  if (cfg.provider === "google") {
    const apiKey = process.env.GOOGLE_GENERATIVE_AI_API_KEY;
    if (!apiKey) {
      throw new Error(`GOOGLE_GENERATIVE_AI_API_KEY required for task ${task}`);
    }
    const google = createGoogleGenerativeAI({ apiKey });
    return google(cfg.modelId);
  }

  throw new Error(`Unsupported provider for task ${task}`);
}
