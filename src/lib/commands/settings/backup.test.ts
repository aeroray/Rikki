import { describe, expect, it } from "vitest";
import {
  backupCounts,
  backupKeyLabel,
  backupLabel,
  backupStamp,
  buildBackupRows,
} from "$lib/commands/settings/backup";
import type { BackupFile } from "$lib/commands/types";
import { i18n } from "$lib/i18n";

i18n.locale = "en";

function file(overrides: Partial<BackupFile> = {}): BackupFile {
  return {
    name: "rikki-2026-10-01-143205.json",
    path: "C:/data/backups/rikki-2026-10-01-143205.json",
    exportedAt: "2026-10-01T06:32:05Z",
    todos: 12,
    snippets: 8,
    valid: true,
    ...overrides,
  };
}

describe("the backup panel's rows", () => {
  it("offers the action, then the files, then the ways in from outside", () => {
    const rows = buildBackupRows({ files: [file()], todos: 12, snippets: 8 });
    expect(rows.map((row) => row.kind)).toEqual([
      "create",
      "backup",
      "import",
      "saveAs",
      "folder",
    ]);
  });

  it("says what the new backup would hold before it is made", () => {
    const [create] = buildBackupRows({ files: [], todos: 12, snippets: 8 });
    expect(create.value).toBe(backupCounts(12, 8));
    expect(create.value).toContain("12");
    expect(create.value).toContain("8");
  });

  /** A file that cannot be read is listed and labelled, not dropped: a backup
   * that silently vanished from the list is the worse failure. */
  it("keeps an unreadable file in the list and says so", () => {
    const rows = buildBackupRows({
      files: [file({ valid: false, exportedAt: "", todos: 0, snippets: 0 })],
      todos: 0,
      snippets: 0,
    });
    const row = rows.find((entry) => entry.kind === "backup");
    expect(row?.value).toBe(i18n.t("settings.backup.unreadable"));
  });

  it("names every row's action, and keeps one word for opening", () => {
    const kinds = ["create", "backup", "import", "saveAs", "folder"] as const;
    for (const kind of kinds) expect(backupKeyLabel(kind)).toBeTruthy();
    expect(backupKeyLabel("folder")).toBe(i18n.t("key.open"));
    expect(new Set(kinds.map(backupKeyLabel)).size).toBe(kinds.length);
  });
});

describe("naming a backup", () => {
  it("shapes the local clock like the file name it becomes", () => {
    expect(backupStamp(new Date(2026, 9, 1, 14, 32, 5))).toBe("2026-10-01-143205");
    expect(backupStamp(new Date(2026, 0, 9, 3, 4, 5))).toBe("2026-01-09-030405");
  });

  it("reads a backup's instant back as a local wall clock", () => {
    const label = backupLabel("2026-10-01T06:32:05Z");
    expect(label).toMatch(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/);
    // Two backups a second apart must not read the same. Backups are made in
    // bursts — one before an import and one after — and two identical rows are
    // two rows the user cannot choose between.
    expect(backupLabel("2026-10-01T06:32:05Z")).not.toBe(backupLabel("2026-10-01T06:32:06Z"));
  });

  it("says a file cannot be read rather than inventing a date", () => {
    expect(backupLabel("")).toBe(i18n.t("settings.backup.unreadable"));
    expect(backupLabel("yesterday")).toBe(i18n.t("settings.backup.unreadable"));
  });
});
