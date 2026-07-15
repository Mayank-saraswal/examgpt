const MAX_URL_BYTES = 100 * 1024 * 1024; // 100MB
const TIMEOUT_MS = 60_000;

export type FetchedFile = {
  bytes: Buffer;
  contentType: string;
  sizeBytes: number;
};

export type FetchedMarkdown = {
  markdown: string;
  sourceUrl: string;
  title?: string;
  images: string[];
};

export type FetchedRemote =
  | { kind: "pdf"; file: FetchedFile }
  | { kind: "markdown"; content: FetchedMarkdown };

/**
 * Server-side URL fetch for PDF-by-URL ingestion.
 * Size cap, content-type check, timeout; reject HTML unless Firecrawl is available.
 */
export async function fetchRemotePdf(url: string): Promise<FetchedFile> {
  const remote = await fetchRemoteUrl(url);
  if (remote.kind !== "pdf") {
    throw new Error(
      "URL returned HTML. Set FIRECRAWL_API_KEY to scrape HTML pages, or paste a direct PDF link.",
    );
  }
  return remote.file;
}

/**
 * Fetch a remote document URL: PDF bytes, or HTML → Firecrawl markdown when configured.
 */
export async function fetchRemoteUrl(url: string): Promise<FetchedRemote> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      signal: controller.signal,
      redirect: "follow",
      headers: {
        "User-Agent": "ExamGPT-Ingest/1.0",
        Accept: "application/pdf,text/html,*/*",
      },
    });
    if (!res.ok) {
      throw new Error(`Failed to fetch URL (HTTP ${res.status})`);
    }

    const contentType = (res.headers.get("content-type") ?? "").toLowerCase();
    const isHtml =
      contentType.includes("text/html") ||
      contentType.includes("application/xhtml");

    if (isHtml) {
      const { firecrawlScrape, FirecrawlDisabledError } = await import(
        "../firecrawl/client"
      );
      try {
        const scraped = await firecrawlScrape(url);
        return {
          kind: "markdown",
          content: {
            markdown: scraped.markdown,
            sourceUrl: scraped.sourceUrl,
            title: scraped.title,
            images: scraped.images,
          },
        };
      } catch (err) {
        if (err instanceof FirecrawlDisabledError) {
          throw new Error(
            "URL returned an HTML page, not a PDF. Set FIRECRAWL_API_KEY to scrape HTML syllabi/papers, or paste a direct PDF link.",
          );
        }
        throw err;
      }
    }

    const lenHeader = res.headers.get("content-length");
    if (lenHeader && Number(lenHeader) > MAX_URL_BYTES) {
      throw new Error(`Remote file exceeds ${MAX_URL_BYTES} bytes`);
    }

    const ab = await res.arrayBuffer();
    const bytes = Buffer.from(ab);
    if (bytes.length > MAX_URL_BYTES) {
      throw new Error(`Remote file exceeds ${MAX_URL_BYTES} bytes`);
    }
    if (bytes.length < 5) {
      throw new Error("Remote file is empty");
    }

    // Magic bytes %PDF
    const magic = bytes.subarray(0, 4).toString("utf8");
    if (magic !== "%PDF" && !contentType.includes("pdf")) {
      // Maybe HTML without content-type — try Firecrawl
      const head = bytes.subarray(0, 200).toString("utf8").toLowerCase();
      if (head.includes("<html") || head.includes("<!doctype")) {
        const { firecrawlScrape, FirecrawlDisabledError } = await import(
          "../firecrawl/client"
        );
        try {
          const scraped = await firecrawlScrape(url);
          return {
            kind: "markdown",
            content: {
              markdown: scraped.markdown,
              sourceUrl: scraped.sourceUrl,
              title: scraped.title,
              images: scraped.images,
            },
          };
        } catch (err) {
          if (err instanceof FirecrawlDisabledError) {
            throw new Error(
              "URL does not look like a PDF. Set FIRECRAWL_API_KEY for HTML pages, or use a direct PDF link.",
            );
          }
          throw err;
        }
      }
      throw new Error(
        "URL does not look like a PDF (missing %PDF header). Rejecting non-PDF content.",
      );
    }

    return {
      kind: "pdf",
      file: {
        bytes,
        contentType: "application/pdf",
        sizeBytes: bytes.length,
      },
    };
  } finally {
    clearTimeout(timer);
  }
}
