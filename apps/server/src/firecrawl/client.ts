/**
 * Firecrawl client — env-gated via FIRECRAWL_API_KEY.
 * Graceful degradation: disabled mode throws FirecrawlDisabledError with a clear message.
 */

export type FirecrawlScrapeResult = {
  markdown: string;
  html?: string;
  sourceUrl: string;
  title?: string;
  images: string[];
};

export type FirecrawlSearchHit = {
  url: string;
  title: string;
  description?: string;
  markdown?: string;
};

export class FirecrawlDisabledError extends Error {
  readonly code = "FIRECRAWL_DISABLED" as const;
  constructor(message = "FIRECRAWL_API_KEY is not set") {
    super(message);
    this.name = "FirecrawlDisabledError";
  }
}

export class FirecrawlRequestError extends Error {
  readonly code = "FIRECRAWL_REQUEST" as const;
  constructor(message: string) {
    super(message);
    this.name = "FirecrawlRequestError";
  }
}

export function firecrawlConfigured(
  apiKey: string | undefined | null = process.env.FIRECRAWL_API_KEY,
): boolean {
  return Boolean(apiKey && apiKey.trim().length > 0);
}

export function getFirecrawlApiKey(): string | null {
  const k = process.env.FIRECRAWL_API_KEY?.trim();
  return k && k.length > 0 ? k : null;
}

/**
 * Scrape a URL to markdown (+ image links). No-op throws when key missing.
 */
export async function firecrawlScrape(
  url: string,
  opts?: { apiKey?: string | null; timeoutMs?: number },
): Promise<FirecrawlScrapeResult> {
  const apiKey = opts?.apiKey ?? getFirecrawlApiKey();
  if (!apiKey) {
    throw new FirecrawlDisabledError(
      "HTML page scrape requires FIRECRAWL_API_KEY. Paste a direct PDF link, or set the key in .env.",
    );
  }

  const controller = new AbortController();
  const timer = setTimeout(
    () => controller.abort(),
    opts?.timeoutMs ?? 60_000,
  );
  try {
    const res = await fetch("https://api.firecrawl.dev/v1/scrape", {
      method: "POST",
      signal: controller.signal,
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        url,
        formats: ["markdown", "html"],
        onlyMainContent: true,
      }),
    });
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      throw new FirecrawlRequestError(
        `Firecrawl scrape failed (HTTP ${res.status}): ${body.slice(0, 200)}`,
      );
    }
    const json = (await res.json()) as {
      success?: boolean;
      data?: {
        markdown?: string;
        html?: string;
        metadata?: { title?: string; sourceURL?: string };
      };
    };
    const markdown = json.data?.markdown?.trim() ?? "";
    if (!markdown) {
      throw new FirecrawlRequestError("Firecrawl returned empty markdown");
    }
    const images = extractImageUrls(markdown, json.data?.html);
    return {
      markdown,
      html: json.data?.html,
      sourceUrl: json.data?.metadata?.sourceURL ?? url,
      title: json.data?.metadata?.title,
      images,
    };
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Search the web and optionally scrape top hits (for cutoff research).
 */
export async function firecrawlSearch(
  query: string,
  opts?: {
    apiKey?: string | null;
    limit?: number;
    scrape?: boolean;
    timeoutMs?: number;
  },
): Promise<FirecrawlSearchHit[]> {
  const apiKey = opts?.apiKey ?? getFirecrawlApiKey();
  if (!apiKey) {
    throw new FirecrawlDisabledError(
      "Web search via Firecrawl requires FIRECRAWL_API_KEY.",
    );
  }
  const controller = new AbortController();
  const timer = setTimeout(
    () => controller.abort(),
    opts?.timeoutMs ?? 60_000,
  );
  try {
    const res = await fetch("https://api.firecrawl.dev/v1/search", {
      method: "POST",
      signal: controller.signal,
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        query,
        limit: opts?.limit ?? 5,
        scrapeOptions: opts?.scrape
          ? { formats: ["markdown"], onlyMainContent: true }
          : undefined,
      }),
    });
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      throw new FirecrawlRequestError(
        `Firecrawl search failed (HTTP ${res.status}): ${body.slice(0, 200)}`,
      );
    }
    const json = (await res.json()) as {
      data?: Array<{
        url?: string;
        title?: string;
        description?: string;
        markdown?: string;
      }>;
    };
    return (json.data ?? [])
      .filter((h) => h.url)
      .map((h) => ({
        url: h.url!,
        title: h.title ?? h.url!,
        description: h.description,
        markdown: h.markdown,
      }));
  } finally {
    clearTimeout(timer);
  }
}

function extractImageUrls(markdown: string, html?: string): string[] {
  const urls = new Set<string>();
  const mdRe = /!\[[^\]]*]\((https?:[^)\s]+)\)/g;
  let m: RegExpExecArray | null;
  while ((m = mdRe.exec(markdown))) {
    urls.add(m[1]!);
  }
  if (html) {
    const imgRe = /<img[^>]+src=["'](https?:[^"']+)["']/gi;
    while ((m = imgRe.exec(html))) {
      urls.add(m[1]!);
    }
  }
  return [...urls].slice(0, 40);
}
