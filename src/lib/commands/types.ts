export interface Command {
  id: string;
  prefix: string;
  title: string;
  description: string;
  icon?: string;
  /** Extra prefixes that activate the same command, e.g. `snippet` for `sn`. */
  aliases?: string[];
  /** action: Enter runs immediately. panel (default): Enter opens the prefix UI. */
  mode?: "panel" | "action";
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
