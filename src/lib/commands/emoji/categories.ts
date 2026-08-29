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

export function emojiCategoryKey(id: EmojiCategoryId): MessageKey {
  return `emoji.category.${id}` as MessageKey;
}

export function emojiCategoryLabel(id: EmojiCategoryId): string {
  return i18n.t(emojiCategoryKey(id));
}

export function categoryMatchNames(id: EmojiCategoryId): string[] {
  const key = emojiCategoryKey(id);
  return [id, zhCN[key], en[key]];
}
