export interface Command {
  id: string;
  prefix: string;
  title: string;
  /** Chinese label shown as `中文 · {title}` when the UI language is zh-CN. */
  titleZh?: string;
  description: string;
  descriptionZh?: string;
  icon?: string;
  /** Extra prefixes that activate the same command, e.g. `snippet` for `sn`. */
  aliases?: string[];
  /** action: Enter runs immediately. panel (default): Enter opens the prefix UI. */
  mode?: "panel" | "action";
  /**
   * Ask before running. Reserved for action commands that cannot be undone —
   * a mis-typed prefix should not be able to shut the machine down.
   */
  confirm?: boolean;
  run: (input: string) => void;
}

export interface Todo {
  id: string;
  text: string;
  done: boolean;
  createdAt: number;
}

export interface CalcHistoryEntry {
  id: string;
  expression: string;
  result: string;
  createdAt: number;
}

export type ThemeId = "dark" | "light";

export type CustomSearchEngine = {
  id: string;
  name: string;
  url: string;
};

export interface AppSettings {
  defaultSearchEngine: string;
  theme: ThemeId;
  hotkey: string;
  locale: string;
  baiduTranslateAppId: string;
  baiduTranslateSecretKey: string;
  translationApiUrl: string;
  translateDefaultTarget: string;
  translateSecondTarget: string;
  customSearchEngines: CustomSearchEngine[];
  clipTextRetentionDays: number | null;
  version: number;
}

export interface Snippet {
  id: string;
  title: string;
  content: string;
  keyword: string;
  tags: string[];
  sensitive: boolean;
  createdAt: number;
  updatedAt: number;
}

export interface ClipboardEntry {
  id: string;
  type: "text" | "image";
  content: string;
  appName: string;
  createdAt: number;
  pinned: boolean;
  width?: number;
  height?: number;
  size?: number;
  isColor?: boolean;
}

export interface CommandMatch {
  command: Command;
  rest: string;
}

export interface InstalledApp {
  id: string;
  name: string;
  path: string;
  alias: string;
  icon: string;
  usageCount: number;
}

export type RootHit =
  | { kind: "command"; id: string; score: number; command: Command }
  | { kind: "app"; id: string; score: number; app: InstalledApp };
