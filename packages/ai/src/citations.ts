import { z } from "zod";

/** Citation attached to an assistant message — only from retrieval metadata. */
export const citationSchema = z.object({
  documentId: z.string().min(1),
  title: z.string().min(1),
  pageNumber: z.number().int().positive(),
  chunkId: z.string().optional(),
  score: z.number().optional(),
});

export type Citation = z.infer<typeof citationSchema>;

export const webSourceSchema = z.object({
  url: z.string().url(),
  title: z.string().min(1),
});

export type WebSource = z.infer<typeof webSourceSchema>;

/** Retrieved chunk used as grounding context. */
export type RetrievedChunk = {
  documentId: string;
  title: string;
  pageNumber: number;
  chunkId?: string;
  text: string;
  score: number;
};

/**
 * Parse citation markers from model text.
 * Supported forms:
 *  - [Book Title, p. 12]
 *  - [Book Title, p.12]
 *  - 【Book Title, p. 12】
 *  - citation:docId:page (machine form preferred)
 */
const MARKER_RE =
  /(?:\[|【)\s*([^\]】,]+?)\s*,\s*p\.?\s*(\d+)\s*(?:\]|】)/gi;
const MACHINE_RE = /\[citation:([a-zA-Z0-9_-]+):(\d+)\]/gi;

export function extractCitationMarkers(text: string): {
  titlePage: { title: string; pageNumber: number }[];
  machine: { documentId: string; pageNumber: number }[];
} {
  const titlePage: { title: string; pageNumber: number }[] = [];
  const machine: { documentId: string; pageNumber: number }[] = [];

  for (const m of text.matchAll(MARKER_RE)) {
    titlePage.push({
      title: m[1]!.trim(),
      pageNumber: Number(m[2]),
    });
  }
  for (const m of text.matchAll(MACHINE_RE)) {
    machine.push({
      documentId: m[1]!,
      pageNumber: Number(m[2]),
    });
  }
  return { titlePage, machine };
}

export type CitationValidationResult = {
  /** Citations that exist in the retrieved set (deduped). */
  valid: Citation[];
  /** Markers that were stripped because they were not in retrieval. */
  stripped: { documentId?: string; title?: string; pageNumber: number; reason: string }[];
  /** Answer text with invalid markers removed. */
  sanitizedContent: string;
};

function keyOf(documentId: string, pageNumber: number): string {
  return `${documentId}::${pageNumber}`;
}

/**
 * Every cited (documentId, page) MUST exist in the retrieved set.
 * Title-only markers are resolved by case-insensitive title match against retrieval.
 * Invented citations are stripped and logged via returned `stripped`.
 */
export function validateAndSanitizeCitations(
  content: string,
  retrieved: RetrievedChunk[],
): CitationValidationResult {
  const allowed = new Map<string, RetrievedChunk>();
  for (const c of retrieved) {
    allowed.set(keyOf(c.documentId, c.pageNumber), c);
  }

  const byTitlePage = new Map<string, RetrievedChunk>();
  for (const c of retrieved) {
    byTitlePage.set(`${c.title.toLowerCase()}::${c.pageNumber}`, c);
  }

  const { titlePage, machine } = extractCitationMarkers(content);
  const validMap = new Map<string, Citation>();
  const stripped: CitationValidationResult["stripped"] = [];

  for (const m of machine) {
    const hit = allowed.get(keyOf(m.documentId, m.pageNumber));
    if (hit) {
      validMap.set(keyOf(hit.documentId, hit.pageNumber), {
        documentId: hit.documentId,
        title: hit.title,
        pageNumber: hit.pageNumber,
        chunkId: hit.chunkId,
        score: hit.score,
      });
    } else {
      stripped.push({
        documentId: m.documentId,
        pageNumber: m.pageNumber,
        reason: "documentId+page not in retrieved set",
      });
    }
  }

  for (const m of titlePage) {
    const hit = byTitlePage.get(`${m.title.toLowerCase()}::${m.pageNumber}`);
    if (hit) {
      validMap.set(keyOf(hit.documentId, hit.pageNumber), {
        documentId: hit.documentId,
        title: hit.title,
        pageNumber: hit.pageNumber,
        chunkId: hit.chunkId,
        score: hit.score,
      });
    } else {
      // Try fuzzy: any retrieved page with matching page number and title substring
      const fuzzy = retrieved.find(
        (c) =>
          c.pageNumber === m.pageNumber &&
          (c.title.toLowerCase().includes(m.title.toLowerCase()) ||
            m.title.toLowerCase().includes(c.title.toLowerCase())),
      );
      if (fuzzy) {
        validMap.set(keyOf(fuzzy.documentId, fuzzy.pageNumber), {
          documentId: fuzzy.documentId,
          title: fuzzy.title,
          pageNumber: fuzzy.pageNumber,
          chunkId: fuzzy.chunkId,
          score: fuzzy.score,
        });
      } else {
        stripped.push({
          title: m.title,
          pageNumber: m.pageNumber,
          reason: "title+page not in retrieved set",
        });
      }
    }
  }

  // Strip invalid machine markers and title markers that were stripped
  let sanitized = content;
  for (const s of stripped) {
    if (s.documentId) {
      const re = new RegExp(
        `\\[citation:${escapeRe(s.documentId)}:${s.pageNumber}\\]`,
        "gi",
      );
      sanitized = sanitized.replace(re, "");
    }
    if (s.title) {
      const re = new RegExp(
        `(?:\\[|【)\\s*${escapeRe(s.title)}\\s*,\\s*p\\.?\\s*${s.pageNumber}\\s*(?:\\]|】)`,
        "gi",
      );
      sanitized = sanitized.replace(re, "");
    }
  }

  // Normalize remaining title markers to stable display form using retrieval titles
  sanitized = sanitized.replace(MACHINE_RE, (_full, docId: string, page: string) => {
    const hit = allowed.get(keyOf(docId, Number(page)));
    if (!hit) return "";
    return `[${hit.title}, p. ${hit.pageNumber}]`;
  });

  sanitized = sanitized.replace(/\n{3,}/g, "\n\n").trim();

  return {
    valid: [...validMap.values()],
    stripped,
    sanitizedContent: sanitized,
  };
}

function escapeRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** Fixed copy when retrieval is below threshold. */
export const NOT_IN_NOTES_MESSAGE =
  "I could not find this in your notes. If you want, search the web — those results will be labeled as from the web, not your notes.";

export const NOT_IN_NOTES_MESSAGE_HI =
  "मुझे यह आपके notes में नहीं मिला। Web search कर सकते हैं — results clearly labeled होंगे as from the web, not your notes.";
