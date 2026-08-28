export type SettingsScreen = "list" | "engine" | "theme" | "hotkey";

const SCREENS: Array<{ screen: Exclude<SettingsScreen, "list">; aliases: string[] }> = [
  { screen: "engine", aliases: ["搜索引擎", "search engine", "search", "engine", "引擎", "搜索"] },
  { screen: "theme", aliases: ["主题", "theme", "外观", "appearance"] },
  { screen: "hotkey", aliases: ["快捷键", "hotkey", "shortcut", "热键"] },
];

export function parseSettingsScreen(rest: string): SettingsScreen {
  const query = rest.trim().toLowerCase();
  if (!query) return "list";

  let best: SettingsScreen = "list";
  let bestLength = 0;
  for (const { screen, aliases } of SCREENS) {
    for (const alias of aliases) {
      const key = alias.toLowerCase();
      const hit =
        query === key || query.startsWith(`${key} `) || (query.length >= 2 && key.startsWith(query));
      if (hit && key.length > bestLength) {
        best = screen;
        bestLength = key.length;
      }
    }
  }
  return best;
}
