/**
 * mem0 integration wrapper (mem0ai@3).
 * MemoryClient.add / .search with userId in options.
 * Outage must degrade silently (return empty / no-throw).
 *
 * @see https://docs.mem0.ai / package mem0ai dist/index.d.ts
 */

export type MemoryFact = {
  id?: string;
  memory: string;
};

type Mem0ClientLike = {
  add: (
    messages: { role: string; content: string }[],
    opts?: { userId?: string },
  ) => Promise<unknown>;
  search: (
    query: string,
    opts?: { userId?: string; topK?: number; filters?: Record<string, unknown> },
  ) => Promise<unknown>;
};

let client: Mem0ClientLike | null | undefined;

function getClient(): Mem0ClientLike | null {
  if (client !== undefined) return client;
  const key = process.env.MEM0_API_KEY;
  if (!key) {
    client = null;
    return null;
  }
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const mod = require("mem0ai") as {
      MemoryClient?: new (opts: { apiKey: string }) => Mem0ClientLike;
      default?: new (opts: { apiKey: string }) => Mem0ClientLike;
    };
    const Ctor = mod.MemoryClient ?? mod.default;
    if (!Ctor) {
      client = null;
      return null;
    }
    client = new Ctor({ apiKey: key });
    return client;
  } catch (err) {
    console.warn("[mem0] init failed — degrading silently", err);
    client = null;
    return null;
  }
}

function normalizeResults(raw: unknown): MemoryFact[] {
  if (!raw) return [];
  if (Array.isArray(raw)) {
    return raw
      .map((r) => {
        const o = r as { memory?: string; id?: string };
        return o.memory ? { id: o.id, memory: o.memory } : null;
      })
      .filter(Boolean) as MemoryFact[];
  }
  const obj = raw as {
    results?: { memory?: string; id?: string }[];
    memories?: { memory?: string; id?: string }[];
  };
  const list = obj.results ?? obj.memories;
  if (Array.isArray(list)) {
    return list
      .map((r) => (r.memory ? { id: r.id, memory: r.memory } : null))
      .filter(Boolean) as MemoryFact[];
  }
  return [];
}

/** Search user memories; empty on any failure. */
export async function searchMemories(
  userId: string,
  query: string,
  limit = 8,
): Promise<MemoryFact[]> {
  const c = getClient();
  if (!c) return [];
  try {
    // mem0ai v3: top-level userId rejected; use filters.user_id
    const res = await c.search(query, {
      topK: limit,
      filters: { user_id: userId },
    });
    return normalizeResults(res);
  } catch (err) {
    // Retry legacy shape once for older SDKs
    try {
      const res = await c.search(query, {
        userId,
        topK: limit,
      });
      return normalizeResults(res);
    } catch (err2) {
      console.warn("[mem0] search failed — degrading silently", err2);
      return [];
    }
  }
}

/** Async write; never throws to caller. */
export async function addMemory(
  userId: string,
  messages: { role: "user" | "assistant"; content: string }[],
): Promise<void> {
  const c = getClient();
  if (!c) return;
  try {
    await c.add(messages, { userId });
  } catch (err) {
    console.warn("[mem0] add failed — degrading silently", err);
  }
}

export function memoryFactsToStrings(facts: MemoryFact[]): string[] {
  return facts.map((f) => f.memory).filter(Boolean);
}
