import { findCategory } from "$lib/commands/emoji/categories";
import type { EmojiCategory } from "$lib/commands/emoji/types";

export type EmojiScreen =
  | { type: "categories" }
  | { type: "category"; category: EmojiCategory }
  | { type: "search"; query: string };

export function parseEmojiScreen(rest: string): EmojiScreen {
  const query = rest.trim();
  if (!query) return { type: "categories" };
  const category = findCategory(query);
  if (category) return { type: "category", category };
  return { type: "search", query };
}
