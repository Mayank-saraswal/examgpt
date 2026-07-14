import { streamText, generateText } from "ai";
import {
  NOT_IN_NOTES_MESSAGE,
  type Citation,
  type RetrievedChunk,
  type WebSource,
  validateAndSanitizeCitations,
} from "./citations";
import { assembleContext, buildRagSystemPrompt } from "./context";
import { getLanguageModel, getTaskModelId } from "./providers";
import { withAiUsage, logAiUsage, assertUnderDailyBudget } from "./usage";

export type RagAnswerKind = "notes" | "not_in_notes" | "clarifying" | "web";

export type RagAnswerResult = {
  kind: RagAnswerKind;
  content: string;
  citations: Citation[];
  webSources: WebSource[];
  strippedCitationCount: number;
};

export async function generateClarifyingQuestion(
  query: string,
  userId?: string | null,
): Promise<string> {
  try {
    const modelId = getTaskModelId("intent-agent");
    const result = await withAiUsage({
      userId,
      task: "intent-agent",
      model: modelId,
      run: async () => {
        const model = getLanguageModel("intent-agent");
        return generateText({
          model,
          temperature: 0.3,
          prompt: `You are an exam tutor intent agent. The student's query is vague and retrieval from their notes was weak.
Ask ONE short clarifying question (one sentence) so you can search their notes better. No multi-part questions. No answers yet.

Query: ${JSON.stringify(query)}`,
        });
      },
    });
    return result.text.trim() || "Which topic or chapter should I focus on for this?";
  } catch {
    return "Which topic or chapter in your notes should I focus on?";
  }
}

export function notInNotesResult(): RagAnswerResult {
  return {
    kind: "not_in_notes",
    content: NOT_IN_NOTES_MESSAGE,
    citations: [],
    webSources: [],
    strippedCitationCount: 0,
  };
}

/**
 * Stream a notes-grounded answer. Caller collects text then runs citation validation.
 */
export async function streamNotesAnswer(opts: {
  query: string;
  chunks: RetrievedChunk[];
  memoryFacts?: string[];
  onToken?: (delta: string) => void;
  signal?: AbortSignal;
  userId?: string | null;
}): Promise<RagAnswerResult> {
  await assertUnderDailyBudget(opts.userId);
  const context = assembleContext(opts.chunks);
  const system = buildRagSystemPrompt({
    memoryFacts: opts.memoryFacts,
    context,
  });
  const modelId = getTaskModelId("chat-rag");
  const model = getLanguageModel("chat-rag");
  const t0 = Date.now();

  const result = streamText({
    model,
    system,
    prompt: opts.query,
    temperature: 0.2,
    abortSignal: opts.signal,
  });

  let full = "";
  for await (const delta of result.textStream) {
    full += delta;
    opts.onToken?.(delta);
  }

  let tokensIn = 0;
  let tokensOut = 0;
  try {
    const usage = await result.usage;
    tokensIn = usage?.inputTokens ?? 0;
    tokensOut = usage?.outputTokens ?? 0;
  } catch {
    /* ignore usage fetch */
  }
  await logAiUsage({
    userId: opts.userId ?? null,
    task: "chat-rag",
    model: modelId,
    tokensIn,
    tokensOut,
    costUsd: null,
    latencyMs: Date.now() - t0,
  });

  const validated = validateAndSanitizeCitations(full, opts.chunks);
  if (validated.stripped.length > 0) {
    console.warn(
      "[rag] stripped invented citations",
      validated.stripped,
    );
  }

  return {
    kind: "notes",
    content: validated.sanitizedContent,
    citations: validated.valid,
    webSources: [],
    strippedCitationCount: validated.stripped.length,
  };
}

export async function generateWebAnswer(opts: {
  query: string;
  onToken?: (delta: string) => void;
  signal?: AbortSignal;
  userId?: string | null;
}): Promise<RagAnswerResult> {
  await assertUnderDailyBudget(opts.userId);
  const modelId = getTaskModelId("web-search");
  const model = getLanguageModel("web-search");
  const system = `You answer exam-prep questions using web knowledge via Perplexity.
Rules:
1. Prefix the answer with a clear badge line: "SOURCE: WEB (not your notes)"
2. Include source URLs as markdown links at the end under "## Sources".
3. Never invent page citations from the user's books.
4. Be concise and exam-focused.`;
  const t0 = Date.now();

  const result = streamText({
    model,
    system,
    prompt: opts.query,
    temperature: 0.3,
    abortSignal: opts.signal,
  });

  let full = "";
  for await (const delta of result.textStream) {
    full += delta;
    opts.onToken?.(delta);
  }

  let tokensIn = 0;
  let tokensOut = 0;
  try {
    const usage = await result.usage;
    tokensIn = usage?.inputTokens ?? 0;
    tokensOut = usage?.outputTokens ?? 0;
  } catch {
    /* ignore */
  }
  await logAiUsage({
    userId: opts.userId ?? null,
    task: "web-search",
    model: modelId,
    tokensIn,
    tokensOut,
    costUsd: null,
    latencyMs: Date.now() - t0,
  });

  const webSources = extractMarkdownLinks(full);
  if (!/SOURCE:\s*WEB/i.test(full)) {
    full = `SOURCE: WEB (not your notes)\n\n${full}`;
  }

  return {
    kind: "web",
    content: full,
    citations: [],
    webSources,
    strippedCitationCount: 0,
  };
}

function extractMarkdownLinks(text: string): WebSource[] {
  const re = /\[([^\]]+)\]\((https?:\/\/[^)]+)\)/g;
  const out: WebSource[] = [];
  const seen = new Set<string>();
  for (const m of text.matchAll(re)) {
    const url = m[2]!;
    if (seen.has(url)) continue;
    seen.add(url);
    out.push({ title: m[1]!, url });
  }
  return out;
}

export async function generateChatTitle(
  firstUserMessage: string,
  userId?: string | null,
): Promise<string> {
  try {
    const modelId = getTaskModelId("title-gen");
    const result = await withAiUsage({
      userId,
      task: "title-gen",
      model: modelId,
      run: async () => {
        const model = getLanguageModel("title-gen");
        return generateText({
          model,
          temperature: 0.2,
          prompt: `Write a short chat title (max 6 words) for this student question. No quotes. No emoji.\n\n${firstUserMessage}`,
        });
      },
    });
    const t = result.text.replace(/["']/g, "").trim().slice(0, 80);
    return t || "New chat";
  } catch {
    return firstUserMessage.slice(0, 48) || "New chat";
  }
}
