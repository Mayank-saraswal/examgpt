import { afterEach, describe, expect, it } from "vitest";
import {
  clearRuntimeModelOverrides,
  getModelConfig,
  inferProviderFromModelId,
  setRuntimeModelOverride,
} from "./registry";

describe("inferProviderFromModelId", () => {
  it("maps OpenAI / Google / OpenRouter ids", () => {
    expect(inferProviderFromModelId("gpt-4o-mini", "google")).toBe("openai");
    expect(inferProviderFromModelId("gemini-3.5-flash", "openai")).toBe(
      "google",
    );
    expect(
      inferProviderFromModelId("anthropic/claude-sonnet-4", "openai"),
    ).toBe("openrouter");
  });

  it("honors explicit provider env value", () => {
    expect(inferProviderFromModelId("custom-model", "google", "openai")).toBe(
      "openai",
    );
  });
});

describe("getModelConfig env override switches provider", () => {
  afterEach(() => {
    delete process.env.AI_MODEL_OCR;
    delete process.env.AI_PROVIDER_OCR;
    clearRuntimeModelOverrides();
  });

  it("keeps google default when no override", () => {
    const cfg = getModelConfig("ocr");
    expect(cfg.provider).toBe("google");
    expect(cfg.modelId).toContain("gemini");
  });

  it("switches ocr to openai when AI_MODEL_OCR is gpt-4o-mini", () => {
    process.env.AI_MODEL_OCR = "gpt-4o-mini";
    const cfg = getModelConfig("ocr");
    expect(cfg.modelId).toBe("gpt-4o-mini");
    expect(cfg.provider).toBe("openai");
  });

  it("switches vision-extract similarly", () => {
    process.env.AI_MODEL_VISION_EXTRACT = "gpt-4o-mini";
    const cfg = getModelConfig("vision-extract");
    expect(cfg.provider).toBe("openai");
  });
});
