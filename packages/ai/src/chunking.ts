/**
 * Page-aware markdown chunker (TASKS.md §5).
 *
 * Invariants:
 * - Target ~400–600 tokens per chunk (approx 4 chars/token)
 * - ~15% overlap between adjacent chunks on the same page
 * - NEVER cross page boundaries (page number is the citation unit)
 * - Markdown tables kept whole (never split mid-table)
 * - Figure blocks `[FIGURE: ...]` kept with surrounding context when possible
 */

export type PageInput = {
  pageNumber: number;
  markdown: string;
};

export type TextChunk = {
  pageNumber: number;
  chunkIndex: number;
  text: string;
  hasImage: boolean;
  tokenEstimate: number;
};

const MIN_TOKENS = 400;
const MAX_TOKENS = 600;
const OVERLAP_RATIO = 0.15;
/** ~4 characters per token heuristic (OpenAI-ish for English/markdown). */
const CHARS_PER_TOKEN = 4;

export function estimateTokens(text: string): number {
  if (!text) return 0;
  return Math.ceil(text.length / CHARS_PER_TOKEN);
}

/**
 * Split a single page's markdown into blocks that must not be split:
 * tables (pipe or GFM) and FIGURE blocks are atomic.
 */
export function splitAtomicBlocks(markdown: string): string[] {
  const lines = markdown.replace(/\r\n/g, "\n").split("\n");
  const blocks: string[] = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i] ?? "";

    // GFM / pipe table: header row with | then separator |---| then body
    if (isTableStart(lines, i)) {
      const tableLines: string[] = [];
      while (i < lines.length && isTableLine(lines[i] ?? "")) {
        tableLines.push(lines[i] ?? "");
        i += 1;
      }
      blocks.push(tableLines.join("\n"));
      continue;
    }

    // FIGURE block: [FIGURE: ...] possibly multi-line until blank or next block
    if (/^\s*\[FIGURE:/i.test(line)) {
      const fig: string[] = [line];
      i += 1;
      while (i < lines.length) {
        const next = lines[i] ?? "";
        if (next.trim() === "" || isTableStart(lines, i) || /^\s*\[FIGURE:/i.test(next)) {
          break;
        }
        // Continue figure only if indented continuation or unclosed bracket
        if (!line.includes("]") && !fig.join("\n").includes("]")) {
          fig.push(next);
          i += 1;
          continue;
        }
        break;
      }
      blocks.push(fig.join("\n"));
      continue;
    }

    // Paragraph / prose block until blank line or special block
    if (line.trim() === "") {
      i += 1;
      continue;
    }
    const para: string[] = [line];
    i += 1;
    while (i < lines.length) {
      const next = lines[i] ?? "";
      if (next.trim() === "" || isTableStart(lines, i) || /^\s*\[FIGURE:/i.test(next)) {
        break;
      }
      para.push(next);
      i += 1;
    }
    blocks.push(para.join("\n"));
  }

  return blocks.filter((b) => b.trim().length > 0);
}

function isTableLine(line: string): boolean {
  const t = line.trim();
  if (!t) return false;
  // pipe table row or separator
  return (
    t.includes("|") &&
    (t.startsWith("|") || t.endsWith("|") || /^\|?[\s:-]+\|/.test(t) || /\|/.test(t))
  );
}

function isTableStart(lines: string[], index: number): boolean {
  const a = (lines[index] ?? "").trim();
  const b = (lines[index + 1] ?? "").trim();
  if (!a.includes("|")) return false;
  // separator like |---|---| or ---|---
  if (/^\|?[\s:|-]+$/.test(b) && b.includes("-")) return true;
  // single-line table-ish starting with |
  if (a.startsWith("|") && a.endsWith("|") && a.split("|").length >= 3) {
    // if next is also table-ish treat as table start
    if (isTableLine(b) || b === "") return true;
  }
  return false;
}

/**
 * Chunk a single page without crossing into other pages.
 */
export function chunkPage(
  pageNumber: number,
  markdown: string,
  options?: { minTokens?: number; maxTokens?: number; overlapRatio?: number },
): TextChunk[] {
  const minT = options?.minTokens ?? MIN_TOKENS;
  const maxT = options?.maxTokens ?? MAX_TOKENS;
  const overlapRatio = options?.overlapRatio ?? OVERLAP_RATIO;

  const blocks = splitAtomicBlocks(markdown);
  if (blocks.length === 0) {
    return [];
  }

  const chunks: TextChunk[] = [];
  let current: string[] = [];
  let currentTokens = 0;
  let chunkIndex = 0;

  const flush = (overlapFrom?: string) => {
    const text = current.join("\n\n").trim();
    if (!text) {
      current = [];
      currentTokens = 0;
      return;
    }
    chunks.push({
      pageNumber,
      chunkIndex,
      text,
      hasImage: /\[FIGURE:/i.test(text),
      tokenEstimate: estimateTokens(text),
    });
    chunkIndex += 1;

    // Build overlap tail for next chunk
    if (overlapFrom) {
      const overlapTokens = Math.floor(maxT * overlapRatio);
      const overlapText = takeTokenTail(overlapFrom, overlapTokens);
      current = overlapText ? [overlapText] : [];
      currentTokens = estimateTokens(overlapText);
    } else {
      current = [];
      currentTokens = 0;
    }
  };

  for (const block of blocks) {
    // Split oversized non-table prose into windows so maxTokens is respected
    const pieces =
      estimateTokens(block) > maxT && !block.includes("|")
        ? splitLongProse(block, maxT)
        : [block];

    for (const piece of pieces) {
      const blockTokens = estimateTokens(piece);

      // Oversized atomic block (e.g. huge table): emit alone
      if (blockTokens > maxT && current.length === 0) {
        current = [piece];
        currentTokens = blockTokens;
        flush();
        continue;
      }

      if (currentTokens + blockTokens > maxT && currentTokens >= minT) {
        flush(current.join("\n\n"));
      } else if (currentTokens + blockTokens > maxT && currentTokens > 0) {
        // Below min but would overflow — flush anyway to respect max
        flush(current.join("\n\n"));
      }

      current.push(piece);
      currentTokens = estimateTokens(current.join("\n\n"));
    }
  }

  if (current.length > 0) {
    flush();
  }

  return chunks;
}

/** Hard-split long prose (not tables) into ~maxTokens windows. */
function splitLongProse(text: string, maxTokens: number): string[] {
  const charBudget = maxTokens * CHARS_PER_TOKEN;
  if (text.length <= charBudget) return [text];
  const parts: string[] = [];
  let i = 0;
  while (i < text.length) {
    let end = Math.min(text.length, i + charBudget);
    if (end < text.length) {
      const slice = text.slice(i, end);
      const lastSpace = Math.max(slice.lastIndexOf(". "), slice.lastIndexOf("\n"), slice.lastIndexOf(" "));
      if (lastSpace > charBudget * 0.5) {
        end = i + lastSpace + 1;
      }
    }
    parts.push(text.slice(i, end).trim());
    i = end;
  }
  return parts.filter(Boolean);
}

function takeTokenTail(text: string, tokenBudget: number): string {
  if (tokenBudget <= 0) return "";
  const charBudget = tokenBudget * CHARS_PER_TOKEN;
  if (text.length <= charBudget) return text;
  // Prefer cutting on paragraph/sentence boundary
  const slice = text.slice(text.length - charBudget);
  const para = slice.indexOf("\n\n");
  if (para >= 0 && para < slice.length - 20) {
    return slice.slice(para + 2).trim();
  }
  return slice.trim();
}

/**
 * Chunk many pages independently (never merges across pages).
 */
export function chunkPages(
  pages: PageInput[],
  options?: { minTokens?: number; maxTokens?: number; overlapRatio?: number },
): TextChunk[] {
  const out: TextChunk[] = [];
  for (const page of pages) {
    out.push(...chunkPage(page.pageNumber, page.markdown, options));
  }
  return out;
}

/** Invariant helpers for tests / runtime asserts */
export function assertChunkInvariants(chunks: TextChunk[]): void {
  for (const c of chunks) {
    if (!Number.isInteger(c.pageNumber) || c.pageNumber < 1) {
      throw new Error(`Invalid pageNumber: ${c.pageNumber}`);
    }
    if (c.chunkIndex < 0) {
      throw new Error(`Invalid chunkIndex: ${c.chunkIndex}`);
    }
  }
  // No multi-page chunk: each chunk has single pageNumber field (by design)
  // Overlap only within same page is enforced by chunkPages calling chunkPage per page
}
