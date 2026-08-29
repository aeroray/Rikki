import data from "@emoji-mart/data";
import type { EmojiMartData } from "@emoji-mart/data";
import { categoryMatchNames, EMOJI_CATEGORIES } from "$lib/commands/emoji/categories";
import type { EmojiCategory, EmojiItem } from "$lib/commands/emoji/types";

const mart = data as EmojiMartData;

function toItem(id: string): EmojiItem | null {
  const entry = mart.emojis[id];
  const native = entry?.skins[0]?.native;
  if (!entry || !native) return null;
  return {
    id: entry.id,
    name: entry.name,
    native,
    keywords: entry.keywords ?? [],
    emoticons: entry.emoticons ?? [],
  };
}

export const emojiCategories = EMOJI_CATEGORIES.map((category) => {
  const source = mart.categories.find((entry) => entry.id === category.id);
  const emojis = (source?.emojis ?? []).map(toItem).filter((item): item is EmojiItem => Boolean(item));
  return { ...category, emojis };
});

const allEmojis = emojiCategories.flatMap((category) => category.emojis);

export function emojisInCategory(id: string): EmojiItem[] {
  return emojiCategories.find((category) => category.id === id)?.emojis ?? [];
}

export function findCategory(query: string): EmojiCategory | null {
  const raw = query.trim();
  if (!raw) return null;
  const q = raw.toLowerCase();
  const exact = emojiCategories.find((category) =>
    categoryMatchNames(category.id).some((name) => name.toLowerCase() === q),
  );
  if (exact) return exact;
  if (raw.length < 2) return null;
  const prefixed = emojiCategories.filter((category) => category.name.startsWith(raw));
  return prefixed.length === 1 ? prefixed[0] : null;
}

export function searchEmojis(query: string): EmojiItem[] {
  const q = query.trim().toLowerCase();
  if (!q) return [];
  return allEmojis.filter((emoji) => {
    if (emoji.id.toLowerCase().includes(q) || emoji.name.toLowerCase().includes(q)) return true;
    if (emoji.keywords.some((keyword) => keyword.toLowerCase().includes(q))) return true;
    return emoji.emoticons.some((emoticon) => emoticon.toLowerCase().includes(q));
  });
}
