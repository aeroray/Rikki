export type SettingsScreen =
  | "list"
  | "engine"
  | "browser"
  | "theme"
  | "hotkey"
  | "language"
  | "retention"
  | "backup";

const SCREENS: Array<{ screen: Exclude<SettingsScreen, "list">; aliases: string[] }> = [
  { screen: "engine", aliases: ["搜索引擎", "search engine", "search", "engine", "引擎", "搜索"] },
  { screen: "browser", aliases: ["浏览器", "browser", "默认浏览器", "打开方式"] },
  { screen: "theme", aliases: ["主题", "theme", "外观", "appearance"] },
  { screen: "hotkey", aliases: ["快捷键", "hotkey", "shortcut", "热键"] },
  { screen: "language", aliases: ["语言", "language", "lang", "locale", "国际化"] },
  { screen: "retention", aliases: ["保留", "retention", "clipboard", "clip", "清理", "过期", "剪贴板保留"] },
  // Export and import are one screen now, so they are one word to type. Both
  // spellings stay, and so do 导出/导入: they are what a user reaches for.
  {
    screen: "backup",
    aliases: ["备份", "backup", "导出", "导入", "export", "import", "恢复", "restore", "数据", "data"],
  },
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
