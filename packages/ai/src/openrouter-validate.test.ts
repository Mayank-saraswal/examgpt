import { describe, expect, it, beforeEach } from "vitest";
import {
  clearRuntimeModelOverrides,
  getModelConfig,
} from "./registry";
import { validateOpenRouterModels } from "./openrouter-validate";

describe("validateOpenRouterModels", () => {
  beforeEach(() => {
    clearRuntimeModelOverrides();
    delete process.env.AI_MODEL_INTENT;
  });

  it("is non-fatal on network failure", async () => {
    const res = await validateOpenRouterModels({
      fetchImpl: async () => {
        throw new Error("offline");
      },
      log: () => {},
    });
    expect(res.networkError).toBeTruthy();
    expect(res.missing).toEqual([]);
  });

  it("falls back when model id missing from catalog", async () => {
    process.env.AI_MODEL_INTENT = "does-not-exist/model-xyz";
    const res = await validateOpenRouterModels({
      fetchImpl: async () =>
        new Response(
          JSON.stringify({
            data: [{ id: "z-ai/glm-5.2" }],
          }),
          { status: 200 },
        ),
      log: () => {},
    });
    expect(res.missing.some((m) => m.task === "intent-agent")).toBe(true);
    // Falls back to registry default for intent-agent
    expect(getModelConfig("intent-agent").modelId).toBe("z-ai/glm-5.2");
  });
});

