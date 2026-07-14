import {
  getDefaultModelId,
  getModelConfig,
  listOpenRouterTasks,
  setRuntimeModelOverride,
  type AiTask,
} from "./registry";

export type OpenRouterValidateResult = {
  ok: boolean;
  checked: number;
  missing: { task: AiTask; requested: string; fellBackTo: string }[];
  networkError?: string;
};

/**
 * Fetch OpenRouter catalog and ensure every configured openrouter model id exists.
 * Missing ids → log warning + fall back to registry default.
 * Network failure is non-fatal.
 */
export async function validateOpenRouterModels(opts?: {
  log?: (msg: string, extra?: Record<string, unknown>) => void;
  fetchImpl?: typeof fetch;
}): Promise<OpenRouterValidateResult> {
  const log = opts?.log ?? ((msg, extra) => console.warn(msg, extra ?? ""));
  const fetchImpl = opts?.fetchImpl ?? fetch;
  const tasks = listOpenRouterTasks();

  if (tasks.length === 0) {
    return { ok: true, checked: 0, missing: [] };
  }

  try {
    const res = await fetchImpl("https://openrouter.ai/api/v1/models", {
      headers: { Accept: "application/json" },
      signal: AbortSignal.timeout(15_000),
    });
    if (!res.ok) {
      const networkError = `OpenRouter models HTTP ${res.status}`;
      log("[ai] OpenRouter catalog fetch failed — skipping validation", {
        networkError,
      });
      return { ok: false, checked: 0, missing: [], networkError };
    }
    const json = (await res.json()) as { data?: { id: string }[] };
    const ids = new Set((json.data ?? []).map((m) => m.id));

    const missing: OpenRouterValidateResult["missing"] = [];
    for (const task of tasks) {
      const cfg = getModelConfig(task);
      if (ids.has(cfg.modelId)) continue;
      const fellBackTo = getDefaultModelId(task);
      missing.push({ task, requested: cfg.modelId, fellBackTo });
      if (cfg.modelId !== fellBackTo) {
        setRuntimeModelOverride(task, fellBackTo);
      }
      log(
        `[ai] OpenRouter model "${cfg.modelId}" for task "${task}" not in catalog — falling back to "${fellBackTo}"`,
      );
    }

    return { ok: missing.length === 0, checked: tasks.length, missing };
  } catch (err) {
    const networkError = err instanceof Error ? err.message : String(err);
    log("[ai] OpenRouter catalog network failure — validation skipped", {
      networkError,
    });
    return { ok: false, checked: 0, missing: [], networkError };
  }
}
