import { streamText, generateText } from "ai";
import {
  NOT_IN_NOTES_MESSAGE,
  type Citation,
  type RetrievedChunk,
  type WebSource,
  validateAndSanitizeCitations,
} from "./citations";
import { assembleContext, buildRagSystemPrompt } from "./context";
import { getLanguageModel } from "./providers";

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
): Promise<string> {
  try {
    const model = getLanguageModel("intent-agent");
    const { text } = await generateText({
      model,
      temperature: 0.3,
      prompt: `You are an exam tutor intent agent. The student's query is vague and retrieval from their notes was weak.
Ask ONE short clarifying question (one sentence) so you can search their notes better. No multi-part questions. No answers yet.

Query: ${JSON.stringify(query)}`,
    });
    return text.trim() || "Which topic or chapter should I focus on for this?";
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
}): Promise<RagAnswerResult> {
  const context = assembleContext(opts.chunks);
  const system = buildRagSystemPrompt({
    memoryFacts: opts.memoryFacts,
    context,
  });
  const model = getLanguageModel("chat-rag");

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
}): Promise<RagAnswerResult> {
  const model = getLanguageModel("web-search");
  const system = `You answer exam-prep questions using web knowledge via Perplexity.
Rules:
1. Prefix the answer with a clear badge line: "SOURCE: WEB (not your notes)"
2. Include source URLs as markdown links at the end under "## Sources".
3. Never invent page citations from the user's books.
4. Be concise and exam-focused.`;

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

  const webSources = extractMarkdownLinks(full);
  // Ensure badge present
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
): Promise<string> {
  try {
    const model = getLanguageModel("title-gen");
    const { text } = await generateText({
      model,
      temperature: 0.2,
      prompt: `Write a short chat title (max 6 words) for this student question. No quotes. No emoji.\n\n${firstUserMessage}`,
    });
    const t = text.replace(/["']/g, "").trim().slice(0, 80);
    return t || "New chat";
  } catch {
    return firstUserMessage.slice(0, 48) || "New chat";
  }
}
