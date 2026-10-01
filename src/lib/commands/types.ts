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

/** What the user picked for the theme. `system` follows the OS and is the default. */
export type ThemePref = "system" | "dark" | "light";

/** What is actually painted, once a preference has been resolved. */
export type ThemeId = "dark" | "light";

export type CustomSearchEngine = {
  id: string;
  name: string;
  url: string;
};

export interface AppSettings {
  defaultSearchEngine: string;
  theme: ThemePref;
  hotkey: string;
  locale: string;
  /** The language code the user last translated into; empty means unchosen. */
  translateTarget: string;
  /** The browser links open in; empty means the system default. */
  browser: string;
  customSearchEngines: CustomSearchEngine[];
  clipTextRetentionDays: number | null;
  version: number;
}

/** A browser found on this machine, as `list_browsers` reports it. */
export interface InstalledBrowser {
  id: string;
  name: string;
  /** The executable, and the value `settings.json` stores. */
  path: string;
  /** The browser's own icon, or empty when none could be extracted. */
  icon: string;
}

/**
 * The file the import row picked, as `pick_import_file` reports it.
 *
 * The path is handed straight back to `import_settings`, and the name is what
 * the confirmation shows: the user chose that file in a system dialog, and its
 * name is the only thing that says which file they chose.
 */
export interface PickedFile {
  path: string;
  name: string;
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
  type: "text" | "image" | "files";
  /**
   * The body itself. For an image it is the file the plugin wrote, and for a
   * `files` entry it is the copied paths joined by a newline.
   */
  content: string;
  appName: string;
  createdAt: number;
  pinned: boolean;
  width?: number;
  height?: number;
  /** Bytes: the image file, or the total size of a copied file list. */
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
