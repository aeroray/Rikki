import { i18n } from "$lib/i18n";
import type { MessageKey } from "$lib/i18n/zh-CN";

export type SearchEngine = {
  id: string;
  name: string;
  url: string;
  custom?: boolean;
};

const BUILTIN_ENGINES = [
  { id: "bing", name: "必应", url: "https://www.bing.com/search?q=" },
  { id: "google", name: "Google", url: "https://www.google.com/search?q=" },
  { id: "baidu", name: "百度", url: "https://www.baidu.com/s?wd=" },
  { id: "duckduckgo", name: "DuckDuckGo", url: "https://duckduckgo.com/?q=" },
  { id: "sogou", name: "搜狗", url: "https://www.sogou.com/web?query=" },
] as const;

type BuiltinEngineId = (typeof BUILTIN_ENGINES)[number]["id"];

export const SEARCH_ENGINES: SearchEngine[] = [...BUILTIN_ENGINES];

/**
 * `engines.${engine.id}` cast to `MessageKey` compiled no matter what the id
 * was, so a renamed engine or a dropped catalog entry rendered the raw key.
 * Spelling the mapping out makes it exhaustive: adding an engine above without
 * a name here is a type error.
 */
const ENGINE_NAME_KEYS: Record<BuiltinEngineId, MessageKey> = {
  bing: "engines.bing",
  google: "engines.google",
  baidu: "engines.baidu",
  duckduckgo: "engines.duckduckgo",
  sogou: "engines.sogou",
};

const ENGINE_IDS = new Set(SEARCH_ENGINES.map((engine) => engine.id));

export function isBuiltinEngineId(id: string): boolean {
  return ENGINE_IDS.has(id);
}

function isNamedBuiltinEngine(id: string): id is BuiltinEngineId {
  return Object.hasOwn(ENGINE_NAME_KEYS, id);
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
  // Fall back to the engine's own label rather than the i18n key string when a
  // custom engine reuses an unknown id.
  return isNamedBuiltinEngine(engine.id) ? i18n.t(ENGINE_NAME_KEYS[engine.id]) : engine.name;
}

export function searchUrl(engine: SearchEngine, query: string): string {
  const encoded = encodeURIComponent(query.trim());
  if (engine.url.includes("%s")) {
    return engine.url.replaceAll("%s", encoded);
  }
  return `${engine.url}${encoded}`;
}

export function isMac(): boolean {
  if (typeof navigator === "undefined") return false;
  return /Mac|iPhone|iPad/.test(navigator.userAgent);
}

/**
 * The modifier the app's own shortcuts are written against.
 *
 * Every handler accepts both `ctrlKey` and `metaKey`, so the keys already work on
 * a Mac — but the chips, hints and footer labels all said "Ctrl+", which told a Mac
 * user to press a key that does nothing there. One helper, so the labels and the
 * handlers cannot disagree again.
 */
export function primaryModifier(): string {
  return isMac() ? "⌘" : "Ctrl";
}

/** A shortcut label with the platform's own modifier, e.g. `⌘N` or `Ctrl+N`. */
export function primaryShortcut(key: string): string {
  return isMac() ? `⌘${key}` : `Ctrl+${key}`;
}

export function defaultHotkey(): string {
  return isMac() ? "Command+K" : "Alt+Space";
}
