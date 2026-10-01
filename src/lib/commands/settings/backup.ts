import type { BackupFile } from "$lib/commands/types";
import { i18n } from "$lib/i18n";

/**
 * One row of the backup panel.
 *
 * The panel is a single list — the action, the backups the app can see, and the
 * two ways in from outside — because they are all "what Enter does here", and a
 * launcher answers that with arrows and Enter rather than with a button in each
 * corner of the screen.
 */
export type BackupRow = {
  /** Stable while the folder does not change, which is what `{#each}` keys on. */
  key: string;
  kind: "create" | "backup" | "import" | "saveAs" | "folder";
  title: string;
  value: string;
  /** Set for `kind === "backup"` only. */
  file?: BackupFile;
};

/** The rows the panel draws, in order: the action, the files, then the exits. */
export function buildBackupRows(input: {
  files: BackupFile[];
  todos: number;
  snippets: number;
}): BackupRow[] {
  return [
    {
      key: "create",
      kind: "create",
      title: i18n.t("settings.backup.create"),
      // The counts sit on the row that writes the file, so the answer to "what
      // is in the backup I am about to make" is on screen before Enter.
      value: backupCounts(input.todos, input.snippets),
    },
    ...input.files.map((file) => ({
      key: file.path,
      kind: "backup" as const,
      title: backupLabel(file.exportedAt),
      value: file.valid
        ? backupCounts(file.todos, file.snippets)
        : i18n.t("settings.backup.unreadable"),
      file,
    })),
    {
      key: "import",
      kind: "import",
      title: i18n.t("settings.backup.importFile"),
      value: i18n.t("settings.backup.importHint"),
    },
    {
      key: "saveAs",
      kind: "saveAs",
      title: i18n.t("settings.backup.saveAs"),
      value: i18n.t("settings.backup.saveAsHint"),
    },
    {
      key: "folder",
      kind: "folder",
      title: i18n.t("settings.backup.openFolder"),
      value: i18n.t("settings.backup.folderHint"),
    },
  ];
}

/** What a backup holds, as the line under its row reads it. */
export function backupCounts(todos: number, snippets: number): string {
  return [
    i18n.t("settings.backup.countTodos", { count: todos }),
    i18n.t("settings.backup.countSnippets", { count: snippets }),
    i18n.t("settings.backup.settings"),
  ].join(i18n.t("settings.backup.join"));
}

/**
 * When a backup was taken, in the reader's own time.
 *
 * The file records UTC, the name it was given carries the local clock, and this
 * is the local rendering of the same instant — so the row, the name in Explorer
 * and the user's watch all agree.
 *
 * Seconds, not minutes, and absolute rather than relative. Backups are made in
 * bursts — one before an import and one after, say — and two rows that read the
 * same are two rows the user cannot choose between, which is exactly when the
 * list has to be readable.
 */
export function backupLabel(exportedAt: string): string {
  const at = new Date(exportedAt);
  if (Number.isNaN(at.getTime())) return i18n.t("settings.backup.unreadable");
  const pad = (value: number) => String(value).padStart(2, "0");
  return (
    `${at.getFullYear()}-${pad(at.getMonth() + 1)}-${pad(at.getDate())}` +
    ` ${pad(at.getHours())}:${pad(at.getMinutes())}:${pad(at.getSeconds())}`
  );
}

/**
 * `2026-10-01-143205`: the local clock, in the shape of the file name it becomes.
 *
 * The name is built here rather than in Rust because Rust has no local clock
 * without another dependency, and the name is what the user reads in Explorer or
 * Finder — a name eight hours off their watch is the kind of detail that makes a
 * backup folder look broken.
 */
export function backupStamp(at: Date): string {
  const pad = (value: number) => String(value).padStart(2, "0");
  return [
    `${at.getFullYear()}-${pad(at.getMonth() + 1)}-${pad(at.getDate())}`,
    `${pad(at.getHours())}${pad(at.getMinutes())}${pad(at.getSeconds())}`,
  ].join("-");
}

/** The footer chip for whatever Enter would do on the highlighted row. */
export function backupKeyLabel(kind: BackupRow["kind"]): string {
  if (kind === "backup") return i18n.t("settings.backup.keyRestore");
  if (kind === "import") return i18n.t("settings.backup.importFile");
  if (kind === "saveAs") return i18n.t("settings.backup.saveAs");
  if (kind === "folder") return i18n.t("key.open");
  return i18n.t("settings.backup.create");
}

/** Row icons, keyed by kind. The names are `SettingItem`'s, checked there. */
export const BACKUP_ICONS = {
  create: "Download",
  backup: "FileJson",
  import: "Upload",
  saveAs: "HardDriveDownload",
  folder: "FolderOpen",
} as const;
