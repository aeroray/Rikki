import type { EmojiCategory, EmojiCategoryId } from "$lib/commands/emoji/types";

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

export const categoryNames: Record<EmojiCategoryId, string> = {
  people: "笑脸与人物",
  nature: "动物与自然",
  foods: "食物与饮品",
  activity: "活动与运动",
  places: "旅行与地点",
  objects: "物品",
  symbols: "符号",
  flags: "旗帜",
};
