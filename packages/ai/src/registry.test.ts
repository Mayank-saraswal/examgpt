import { afterEach, describe, expect, it } from "vitest";
import {
  clearRuntimeModelOverrides,
  getModelConfig,
  inferProviderFromModelId,
  selectExplainTask,
  setRuntimeModelOverride,
} from "./registry";

describe("inferProviderFromModelId", () => {
  it("maps OpenAI / Google / OpenRouter ids", () => {
    expect(inferProviderFromModelId("gpt-4o-mini", "google")).toBe("openai");
    expect(inferProviderFromModelId("gemini-3.5-flash", "openai")).toBe(
      "google",
    );
    expect(
      inferProviderFromModelId("anthropic/claude-sonnet-5", "openai"),
    ).toBe("openrouter");
    expect(inferProviderFromModelId("z-ai/glm-5.2", "google")).toBe(
      "openrouter",
    );
    expect(inferProviderFromModelId("x-ai/grok-4.5", "openai")).toBe(
      "openrouter",
    );
  });

  it("honors explicit provider env value", () => {
    expect(inferProviderFromModelId("custom-model", "google", "openai")).toBe(
      "openai",
    );
  });
});

describe("getModelConfig defaults (Phase 7.5 routing)", () => {
  afterEach(() => {
    delete process.env.AI_MODEL_OCR;
    delete process.env.AI_MODEL_REPORT;
    delete process.env.AI_MODEL_INTENT;
    delete process.env.AI_MODEL_EXPLAIN;
    delete process.env.AI_MODEL_PAPERGEN;
    clearRuntimeModelOverrides();
  });

  it("uses glm-5.2 for intent and explain", () => {
    expect(getModelConfig("intent-agent").modelId).toBe("z-ai/glm-5.2");
    expect(getModelConfig("explain").modelId).toBe("z-ai/glm-5.2");
  });

  it("uses grok-4.5 for report-analysis", () => {
    expect(getModelConfig("report-analysis").modelId).toBe("x-ai/grok-4.5");
    expect(getModelConfig("report-analysis").provider).toBe("openrouter");
  });

  it("uses claude-sonnet-5 for paper-generation and explain-vision", () => {
    expect(getModelConfig("paper-generation").modelId).toBe(
      "anthropic/claude-sonnet-5",
    );
    expect(getModelConfig("explain-vision").modelId).toBe(
      "anthropic/claude-sonnet-5",
    );
  });

  it("AI_MODEL_REPORT override fully switches model and provider", () => {
    process.env.AI_MODEL_REPORT = "anthropic/claude-opus-4.8";
    const cfg = getModelConfig("report-analysis");
    expect(cfg.modelId).toBe("anthropic/claude-opus-4.8");
    expect(cfg.provider).toBe("openrouter");
  });

  it("switches ocr to openai when AI_MODEL_OCR is gpt-4o-mini", () => {
    process.env.AI_MODEL_OCR = "gpt-4o-mini";
    const cfg = getModelConfig("ocr");
    expect(cfg.modelId).toBe("gpt-4o-mini");
    expect(cfg.provider).toBe("openai");
  });
});

describe("selectExplainTask", () => {
  it("routes to explain-vision when imageKeys present", () => {
    expect(selectExplainTask(["k1"])).toBe("explain-vision");
    expect(selectExplainTask([])).toBe("explain");
    expect(selectExplainTask(null)).toBe("explain");
  });
});
