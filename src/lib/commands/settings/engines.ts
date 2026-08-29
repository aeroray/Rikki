import type { ThemeId } from "$lib/commands/types";
import { i18n } from "$lib/i18n";
import type { MessageKey } from "$lib/i18n/zh-CN";

export type { ThemeId };

export type SearchEngine = {
  id: string;
  name: string;
  url: string;
  custom?: boolean;
};

export const SEARCH_ENGINES: SearchEngine[] = [
  { id: "bing", name: "必应", url: "https://www.bing.com/search?q=" },
  { id: "google", name: "Google", url: "https://www.google.com/search?q=" },
  { id: "baidu", name: "百度", url: "https://www.baidu.com/s?wd=" },
  { id: "duckduckgo", name: "DuckDuckGo", url: "https://duckduckgo.com/?q=" },
  { id: "sogou", name: "搜狗", url: "https://www.sogou.com/web?query=" },
];

const ENGINE_IDS = new Set(SEARCH_ENGINES.map((engine) => engine.id));

export function isBuiltinEngineId(id: string): boolean {
  return ENGINE_IDS.has(id);
}

export function getSearchEngine(id: string, custom: SearchEngine[] = []): SearchEngine {
  return (
    SEARCH_ENGINES.find((engine) => engine.id === id) ??
    custom.find((engine) => engine.id === id) ??
    SEARCH_ENGINES[0]!
  );
}

export function engineDisplayName(engine: SearchEngine): string {
  if (engine.custom) return engine.name;
  const key = `engines.${engine.id}` as MessageKey;
  return i18n.t(key);
}

export function searchUrl(engine: SearchEngine, query: string): string {
  const encoded = encodeURIComponent(query.trim());
  if (engine.url.includes("%s")) {
    return engine.url.replaceAll("%s", encoded);
  }
  return `${engine.url}${encoded}`;
}

export function isMac(): boolean {
  return /Mac|iPhone|iPad/.test(navigator.userAgent);
}

export function defaultHotkey(): string {
  return isMac() ? "Command+K" : "Alt+Space";
}

export function applyTheme(theme: ThemeId) {
  if (typeof document === "undefined") return;
  document.documentElement.dataset.theme = theme;
}
