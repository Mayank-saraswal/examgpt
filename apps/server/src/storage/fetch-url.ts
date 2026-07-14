const MAX_URL_BYTES = 100 * 1024 * 1024; // 100MB
const TIMEOUT_MS = 60_000;

export type FetchedFile = {
  bytes: Buffer;
  contentType: string;
  sizeBytes: number;
};

/**
 * Server-side URL fetch for PDF-by-URL ingestion.
 * Size cap, content-type check, timeout; reject HTML.
 */
export async function fetchRemotePdf(url: string): Promise<FetchedFile> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      signal: controller.signal,
      redirect: "follow",
      headers: {
        "User-Agent": "ExamGPT-Ingest/1.0",
        Accept: "application/pdf,*/*",
      },
    });
    if (!res.ok) {
      throw new Error(`Failed to fetch URL (HTTP ${res.status})`);
    }

    const contentType = (res.headers.get("content-type") ?? "").toLowerCase();
    if (
      contentType.includes("text/html") ||
      contentType.includes("application/xhtml")
    ) {
      throw new Error(
        "URL returned an HTML page, not a PDF. Paste a direct PDF link.",
      );
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
      throw new Error(
        "URL does not look like a PDF (missing %PDF header). Rejecting non-PDF content.",
      );
    }

    return {
      bytes,
      contentType: contentType.includes("pdf")
        ? "application/pdf"
        : "application/pdf",
      sizeBytes: bytes.length,
    };
  } finally {
    clearTimeout(timer);
  }
}
