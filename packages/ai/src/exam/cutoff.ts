import { generateObject, generateText } from "ai";
import { z } from "zod";
import { getLanguageModel, getTaskModelId } from "../providers";
import { withAiUsage } from "../usage";

export const cutoffDataSchema = z.object({
  found: z.boolean(),
  year: z.number().int().optional(),
  exam: z.string().optional(),
  /** Official/category cutoffs — only when found with sources */
  cutoffs: z
    .array(
      z.object({
        category: z.string(),
        marks: z.number().optional(),
        rank: z.number().optional(),
      }),
    )
    .default([]),
  sourceUrls: z.array(z.string().url()).default([]),
  verdict: z.string().nullable(),
  /** Explicit when research failed — never invent numbers */
  notFoundReason: z.string().optional(),
});

export type CutoffData = z.infer<typeof cutoffDataSchema>;

/**
 * Optional Firecrawl search+scrape for cutoff research (injected by server).
 * When WEBSEARCH_BACKEND=firecrawl the server passes real scraped hits.
 */
export type CutoffWebSearchHit = {
  url: string;
  title: string;
  markdown?: string;
  description?: string;
};

/**
 * PYQ-only cutoff research via web-search model (default) or Firecrawl hits.
 * If sources are missing or model is unsure, returns found:false — never invents cutoffs.
 */
export async function researchExamCutoff(opts: {
  userId?: string | null;
  examType: string;
  paperYear?: number | null;
  paperTitle?: string | null;
  score: number;
  maxScore: number;
  /**
   * When provided (firecrawl backend), synthesize from these sources with `explain`
   * instead of calling the web-search model.
   */
  firecrawlHits?: CutoffWebSearchHit[];
}): Promise<CutoffData> {
  const year = opts.paperYear ?? undefined;
  const query = [
    `${opts.examType} ${year ?? ""} exam qualifying cutoff marks official`,
    opts.paperTitle ?? "",
    "NTA",
  ]
    .join(" ")
    .replace(/\s+/g, " ")
    .trim();

  try {
    // Firecrawl path: synthesize from scraped official sources
    if (opts.firecrawlHits && opts.firecrawlHits.length > 0) {
      const context = opts.firecrawlHits
        .map(
          (h, i) =>
            `### Source ${i + 1}: ${h.title}\nURL: ${h.url}\n${(h.markdown ?? h.description ?? "").slice(0, 4000)}`,
        )
        .join("\n\n");
      const modelId = getTaskModelId("explain");
      const objectResult = await withAiUsage({
        userId: opts.userId,
        task: "explain",
        model: modelId,
        run: async () => {
          const model = getLanguageModel("explain");
          return generateObject({
            model,
            schema: cutoffDataSchema,
            temperature: 0,
            prompt: `From the scraped sources below, extract official ${opts.examType} ${year ?? ""} cutoff marks.
Rules:
- Only use numbers that appear in the sources.
- sourceUrls must be real URLs from the sources list.
- If cutoffs are not clearly present, set found=false and notFoundReason.
- Do not invent cutoffs. Student score ${opts.score}/${opts.maxScore} is for verdict context only.

Sources:
${context.slice(0, 80_000)}`,
          });
        },
      });
      const data = objectResult.object;
      if (!data.found || data.sourceUrls.length === 0) {
        return {
          found: false,
          year,
          exam: opts.examType,
          cutoffs: [],
          sourceUrls: opts.firecrawlHits.map((h) => h.url).slice(0, 5),
          verdict: null,
          notFoundReason:
            data.notFoundReason ??
            "No reliable cutoff numbers found in scraped sources",
        };
      }
      return {
        ...data,
        year: data.year ?? year,
        exam: data.exam ?? opts.examType,
        sourceUrls: data.sourceUrls.length
          ? data.sourceUrls
          : opts.firecrawlHits.map((h) => h.url),
      };
    }

    const modelId = getTaskModelId("web-search");
    const textResult = await withAiUsage({
      userId: opts.userId,
      task: "web-search",
      model: modelId,
      run: async () => {
        const model = getLanguageModel("web-search");
        return generateText({
          model,
          temperature: 0,
          prompt: `Search for official ${opts.examType} ${year ?? "recent"} exam cutoff / qualifying marks.
Rules:
- Only report numbers that appear in reputable sources (NTA, official PDF, major education sites).
- Always include full source URLs.
- If you cannot find reliable cutoff data, say "NOT_FOUND" clearly.
- Do not invent or estimate cutoffs.

Query: ${query}
Student score for comparison only (do not invent ranks): ${opts.score}/${opts.maxScore}`,
        });
      },
    });

    const raw = textResult.text ?? "";
    if (/NOT_FOUND|could not find|no reliable|unavailable/i.test(raw) && !/\d{2,3}/.test(raw)) {
      return {
        found: false,
        year,
        exam: opts.examType,
        cutoffs: [],
        sourceUrls: [],
        verdict: null,
        notFoundReason: "No reliable cutoff sources returned by web search",
      };
    }

    // Extract URLs from markdown links or bare https
    const urls = new Set<string>();
    for (const m of raw.matchAll(/\]\((https?:\/\/[^)]+)\)/g)) {
      urls.add(m[1]!);
    }
    for (const m of raw.matchAll(/https?:\/\/[^\s)\]>"']+/g)) {
      urls.add(m[0]!.replace(/[.,;]+$/, ""));
    }

    const structured = await withAiUsage({
      userId: opts.userId,
      task: "report-analysis",
      model: getTaskModelId("report-analysis"),
      run: async () => {
        const model = getLanguageModel("report-analysis");
        return generateObject({
          model,
          schema: cutoffDataSchema,
          temperature: 0,
          prompt: `Extract exam cutoff facts from the web research text.
Rules:
- found=true ONLY if concrete cutoff marks/ranks appear WITH source URLs.
- Never invent numbers not present in the text.
- sourceUrls must be real URLs from the text.
- verdict: compare student score ${opts.score}/${opts.maxScore} to found cutoffs if possible; else null.
- If unsure, found=false and explain in notFoundReason.

TEXT:
${raw.slice(0, 12_000)}

Known URLs: ${[...urls].slice(0, 10).join(", ")}`,
        });
      },
    });

    const obj = structured.object;
    // Safety: no sources → not found
    if (!obj.found || obj.sourceUrls.length === 0) {
      return {
        found: false,
        year,
        exam: opts.examType,
        cutoffs: [],
        sourceUrls: obj.sourceUrls ?? [],
        verdict: null,
        notFoundReason:
          obj.notFoundReason ??
          "Cutoff data missing reliable source URLs — not shown",
      };
    }
    return {
      ...obj,
      year: obj.year ?? year,
      exam: obj.exam ?? opts.examType,
    };
  } catch (err) {
    return {
      found: false,
      year,
      exam: opts.examType,
      cutoffs: [],
      sourceUrls: [],
      verdict: null,
      notFoundReason:
        err instanceof Error
          ? `Cutoff research failed: ${err.message.slice(0, 200)}`
          : "Cutoff research failed",
    };
  }
}
