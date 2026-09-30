import type { EmojiMartData } from "@emoji-mart/data";
import { EMOJI_CATEGORIES } from "$lib/commands/emoji/categories";
import type { EmojiCategory, EmojiItem } from "$lib/commands/emoji/types";

export const EMOJI_SEARCH_LIMIT = 96;

export type EmojiCategoryPack = EmojiCategory & { emojis: EmojiItem[] };

export type PackedEmoji = EmojiItem & { haystack: string };

type Pack = {
  categories: EmojiCategoryPack[];
  all: PackedEmoji[];
};

let pack: Pack | null = null;
let loading: Promise<Pack> | null = null;

export async function loadEmojiData(): Promise<Pack> {
  if (pack) return pack;
  if (!loading) {
    loading = import("@emoji-mart/data")
      .then((mod) => (pack = buildPack(mod.default as EmojiMartData)))
      .catch((err) => {
        // Never cache the rejection: with `??=` a single failed import left the
        // emoji panel unusable (and the promise unhandled) for the whole session.
        loading = null;
        throw err;
      });
  }
  return loading;
}

export function emojisInCategory(id: string, categories: EmojiCategoryPack[]): EmojiItem[] {
  return categories.find((category) => category.id === id)?.emojis ?? [];
}

export function searchEmojis(query: string, all: PackedEmoji[]): EmojiItem[] {
  const q = query.trim().toLowerCase();
  if (!q) return [];
  const hits: EmojiItem[] = [];
  for (const emoji of all) {
    if (!emoji.haystack.includes(q)) continue;
    hits.push(emoji);
    if (hits.length >= EMOJI_SEARCH_LIMIT) break;
  }
  return hits;
}

function buildPack(mart: EmojiMartData): Pack {
  const categories = EMOJI_CATEGORIES.map((category) => {
    const source = mart.categories.find((entry) => entry.id === category.id);
    const emojis = (source?.emojis ?? [])
      .map((id) => toItem(mart, id))
      .filter((item): item is PackedEmoji => Boolean(item));
    return { ...category, emojis };
  });
  return {
    categories,
    all: categories.flatMap((category) => category.emojis),
  };
}

function toItem(mart: EmojiMartData, id: string): PackedEmoji | null {
  const entry = mart.emojis[id];
  const native = entry?.skins[0]?.native;
  if (!entry || !native) return null;
  const keywords = entry.keywords ?? [];
  const emoticons = entry.emoticons ?? [];
  return {
    id: entry.id,
    name: entry.name,
    native,
    keywords,
    emoticons,
    haystack: `${entry.id} ${entry.name} ${keywords.join(" ")} ${emoticons.join(" ")}`.toLowerCase(),
  };
}
