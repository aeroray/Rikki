import { fuzzyScore } from "$lib/fuzzy";
import type { Anniversary } from "./dates";

/** Filters the saved list by title. */
export function filterAnniversaries(items: Anniversary[], query: string): Anniversary[] {
  const q = query.trim();
  if (!q) return items;
  return items
    .map((item) => ({ item, score: fuzzyScore(q, item.title) }))
    .filter((entry) => entry.score > 0)
    .sort((a, b) => b.score - a.score)
    .map((entry) => entry.item);
}
