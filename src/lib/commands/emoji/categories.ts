import type { EmojiCategory, EmojiCategoryId } from "$lib/commands/emoji/types";
import { i18n } from "$lib/i18n";
import { en } from "$lib/i18n/en";
import { zhCN, type MessageKey } from "$lib/i18n/zh-CN";

export const EMOJI_GRID_COLS = 12;

export const EMOJI_CATEGORIES: EmojiCategory[] = [
  { id: "people", name: "笑脸与人物", icon: "😊" },
  { id: "nature", name: "动物与自然", icon: "🐶" },
  { id: "foods", name: "食物与饮品", icon: "🍔" },
  { id: "activity", name: "活动与运动", icon: "⚽" },
  { id: "places", name: "旅行与地点", icon: "✈️" },
  { id: "objects", name: "物品", icon: "📦" },
  { id: "symbols", name: "符号", icon: "💡" },
  { id: "flags", name: "旗帜", icon: "🏁" },
];

/**
 * `emoji.category.${id}` cast to `MessageKey` compiled for any id, so a new
 * category without catalog entries produced an undefined lookup at runtime.
 * Spelling the mapping out makes it exhaustive: a category id in
 * `EmojiCategoryId` without a key here is a type error.
 */
const EMOJI_CATEGORY_KEYS: Record<EmojiCategoryId, MessageKey> = {
  people: "emoji.category.people",
  nature: "emoji.category.nature",
  foods: "emoji.category.foods",
  activity: "emoji.category.activity",
  places: "emoji.category.places",
  objects: "emoji.category.objects",
  symbols: "emoji.category.symbols",
  flags: "emoji.category.flags",
};

export function emojiCategoryKey(id: EmojiCategoryId): MessageKey {
  return EMOJI_CATEGORY_KEYS[id];
}

export function emojiCategoryLabel(id: EmojiCategoryId): string {
  return i18n.t(emojiCategoryKey(id));
}

export function categoryMatchNames(id: EmojiCategoryId): string[] {
  const key = emojiCategoryKey(id);
  // An id with no mapping (or a label dropped from one catalog) yields
  // undefined here; matching on the raw id beats throwing on every keystroke.
  return [id, zhCN[key], en[key]].filter((name): name is string => Boolean(name));
}

export function findCategory(query: string): EmojiCategory | null {
  const raw = query.trim();
  if (!raw) return null;
  const q = raw.toLowerCase();
  const exact = EMOJI_CATEGORIES.find((category) =>
    categoryMatchNames(category.id).some((name) => name.toLowerCase() === q),
  );
  if (exact) return exact;
  if (q.length < 2) return null;
  // Match every known name (id plus both localized labels), not just the
  // hardcoded Chinese label: `peop`, `nat` and `fla` used to find nothing.
  const prefixed = EMOJI_CATEGORIES.filter((category) =>
    categoryMatchNames(category.id).some((name) => name.toLowerCase().startsWith(q)),
  );
  return prefixed.length === 1 ? prefixed[0] : null;
}
