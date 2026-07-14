/**
 * Reciprocal Rank Fusion for hybrid dense + sparse retrieval.
 * @see https://plg.uwaterloo.ca/~gvcormac/cormacksigir09-rrf.pdf
 */
export function reciprocalRankFusion<T extends { id: string }>(
  rankedLists: T[][],
  k = 60,
): { id: string; score: number; item: T }[] {
  const scores = new Map<string, { score: number; item: T }>();

  for (const list of rankedLists) {
    list.forEach((item, rank) => {
      const add = 1 / (k + rank + 1);
      const prev = scores.get(item.id);
      if (prev) {
        prev.score += add;
      } else {
        scores.set(item.id, { score: add, item });
      }
    });
  }

  return [...scores.values()]
    .map((v) => ({ id: v.item.id, score: v.score, item: v.item }))
    .sort((a, b) => b.score - a.score);
}
