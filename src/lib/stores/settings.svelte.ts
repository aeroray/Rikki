import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import {
  applyTheme,
  defaultHotkey,
  getSearchEngine,
  engineDisplayName,
  SEARCH_ENGINES,
  type SearchEngine,
  type ThemeId,
} from "$lib/commands/settings/engines";
import { backupCounts, backupLabel, backupStamp, buildBackupRows } from "$lib/commands/settings/backup";
import { eventToHotkey, formatHotkey } from "$lib/commands/settings/hotkey";
import { browserDisplayName, browserOptionList } from "$lib/commands/settings/browsers";
import { i18n } from "$lib/i18n";
import { parseLocalePref, resolveLocale, type LocalePref } from "$lib/i18n/locale";
import { parseClipRetentionDays, type ClipRetentionDays } from "$lib/commands/clip/cleanup";
import type { SettingsScreen } from "$lib/commands/settings/parse";
import type { AppSettings, BackupFile, InstalledBrowser } from "$lib/commands/types";
import { snippets } from "$lib/stores/snippets.svelte";
import { todos } from "$lib/stores/todos.svelte";
import { ui } from "$lib/stores/ui.svelte";

export type SettingItem = {
  id:
    | "engine"
    | "browser"
    | "theme"
    | "hotkey"
    | "language"
    | "retention"
    | "cleanup"
    | "backup";
  title: string;
  value: string;
  icon:
    | "Globe"
    | "Compass"
    | "Palette"
    | "Keyboard"
    | "Languages"
    | "Timer"
    | "Eraser"
    | "Download"
    | "Upload";
  current?: boolean;
};

export type ThemeOption = {
  id: ThemeId;
  name: string;
};

export type EngineDraft = {
  name: string;
  url: string;
};

export type LocaleOption = {
  id: LocalePref;
};

export type RetentionOption = {
  id: ClipRetentionDays;
};

class SettingsStore {
  engineId = $state("bing");
  theme = $state<ThemeId>("dark");
  hotkey = $state("");
  localePref = $state<LocalePref>("system");
  translateTarget = $state("");
  browserPath = $state("");
  installedBrowsers = $state<InstalledBrowser[]>([]);
  /** False until `list_browsers` has answered, so an empty list can be told
   * apart from a list that has not arrived yet. */
  browsersLoaded = $state(false);
  clipTextRetentionDays = $state<ClipRetentionDays>(7);
  customEngines = $state<SearchEngine[]>([]);
  backups = $state<BackupFile[]>([]);
  /** The path-entry screen, or null when it is not on screen. */
  importDraft = $state<{ path: string } | null>(null);
  /** What the path currently typed in that screen resolves to. */
  importPreview = $state<{ kind: "ok"; file: BackupFile } | { kind: "bad" } | null>(null);
  selectedIndex = $state(0);
  notice = $state<string | null>(null);
  recording = $state(false);
  engineDraft = $state<EngineDraft | null>(null);
  private ready: Promise<void>;
  private browserLoad: Promise<void> | null = null;
  private noticeTimer: ReturnType<typeof setTimeout> | null = null;
  private returnTimer: ReturnType<typeof setTimeout> | null = null;
  private previewTimer: ReturnType<typeof setTimeout> | null = null;

  constructor() {
    this.ready = this.hydrate();
    // The settings row shows the chosen browser by name, so the list is needed
    // before the picker is ever opened. Detection is a registry read, not an
    // app scan, so this is cheap enough to start with the rest of the boot.
    void this.loadBrowsers();
    // Same reason: the backup row shows when the last backup was taken, and the
    // panel opens on a list that has to be there before the user arrows into it.
    void this.loadBackups();
    ui.onHideFlush(() => {
      // Without this the 1.5s "return to the settings list" timer fired after
      // the palette was hidden and overwrote whatever the user typed next.
      this.cancelReturn();
    });
    // Losing focus ends a capture on the Rust side, which re-registers the old
    // shortcut, but it cannot reach into this store. Without this the recorder
    // stayed on screen claiming to listen for a new shortcut while the old one
    // was live again — pressing it then toggled the palette instead of being
    // recorded.
    void listen("hotkey-capture-cancelled", () => {
      this.recording = false;
    }).catch(() => {});
  }

  readonly themes = $derived<ThemeOption[]>([
    { id: "dark", name: i18n.t("theme.dark") },
    { id: "light", name: i18n.t("theme.light") },
  ]);

  readonly locales: LocaleOption[] = [{ id: "system" }, { id: "zh-CN" }, { id: "en" }];

  readonly retentionOptions: RetentionOption[] = [{ id: 7 }, { id: 30 }, { id: 0 }];

  readonly engines = $derived.by((): SearchEngine[] => [
    ...SEARCH_ENGINES,
    ...this.customEngines.map((engine) => ({ ...engine, custom: true })),
  ]);

  readonly engine = $derived(getSearchEngine(this.engineId, this.customEngines));

  readonly browserOptions = $derived(browserOptionList(this.installedBrowsers));

  readonly browserLabel = $derived(browserDisplayName(this.browserPath, this.installedBrowsers));

  readonly hotkeyLabel = $derived(formatHotkey(this.hotkey || defaultHotkey()));

  readonly themeLabel = $derived(this.theme === "light" ? i18n.t("theme.light") : i18n.t("theme.dark"));

  readonly localeLabel = $derived(this.prefLabel(this.localePref));

  readonly retentionLabel = $derived(this.retentionPrefLabel(this.clipTextRetentionDays));

  /** The rows of the backup screen, in one list: action, files, ways in. */
  readonly backupRows = $derived(
    buildBackupRows({
      files: this.backups,
      todos: todos.todos.length,
      snippets: snippets.items.length,
    }),
  );

  /** What the settings row says: when the newest readable backup was taken. */
  readonly backupSummary = $derived.by(() => {
    const newest = this.backups.find((file) => file.valid);
    return newest
      ? i18n.t("settings.backup.last", { when: backupLabel(newest.exportedAt) })
      : i18n.t("settings.backup.none");
  });

  readonly listItems = $derived.by((): SettingItem[] => [
    {
      id: "engine",
      title: i18n.t("settings.engine"),
      value: engineDisplayName(this.engine),
      icon: "Globe",
    },
    {
      id: "browser",
      title: i18n.t("settings.browser"),
      value: this.browserLabel,
      icon: "Compass",
    },
    {
      id: "theme",
      title: i18n.t("settings.theme"),
      value: this.themeLabel,
      icon: "Palette",
    },
    {
      id: "hotkey",
      title: i18n.t("settings.hotkey"),
      value: this.hotkeyLabel,
      icon: "Keyboard",
    },
    {
      id: "language",
      title: i18n.t("settings.language"),
      value: this.localeLabel,
      icon: "Languages",
    },
    {
      id: "retention",
      title: i18n.t("settings.clipRetention"),
      value: this.retentionLabel,
      icon: "Timer",
    },
    {
      id: "cleanup",
      title: i18n.t("settings.clipCleanup"),
      value:
        this.clipTextRetentionDays > 0
          ? i18n.t("settings.clipCleanup.value", { days: this.clipTextRetentionDays })
          : i18n.t("settings.clipCleanup.disabled"),
      icon: "Eraser",
      current: false,
    },
    {
      id: "backup",
      title: i18n.t("settings.backup"),
      value: this.backupSummary,
      icon: "Download",
      current: false,
    },
  ]);

  prefLabel(pref: LocalePref): string {
    if (pref === "zh-CN") return i18n.t("settings.language.zh");
    if (pref === "en") return i18n.t("settings.language.en");
    return i18n.t("settings.language.system");
  }

  retentionPrefLabel(days: ClipRetentionDays): string {
    if (days === 0) return i18n.t("settings.clipRetention.never");
    return i18n.t("settings.clipRetention.days", { days });
  }

  clampSelection(count: number) {
    if (this.selectedIndex < 0) this.selectedIndex = 0;
    if (count === 0) {
      this.selectedIndex = 0;
      return;
    }
    if (this.selectedIndex >= count) this.selectedIndex = count - 1;
  }

  /** Row count for a settings screen; the arrow-key handlers need it before the panel renders. */
  countFor(screen: SettingsScreen): number {
    switch (screen) {
      case "engine":
        return this.engines.length;
      case "browser":
        return this.browserOptions.length;
      case "theme":
        return this.themes.length;
      case "language":
        return this.locales.length;
      case "retention":
        return this.retentionOptions.length;
      case "backup":
        return this.backupRows.length;
      case "hotkey":
        return 0;
      default:
        return this.listItems.length;
    }
  }

  cancelReturn() {
    if (this.returnTimer) {
      clearTimeout(this.returnTimer);
      this.returnTimer = null;
    }
  }

  openEngineCreate() {
    this.engineDraft = {
      name: "",
      url: "",
    };
    ui.focusField = "engine-name";
  }

  closeEngineDraft() {
    this.engineDraft = null;
    ui.focusField = "search";
  }

  async setEngine(id: string): Promise<boolean> {
    return this.patch("defaultSearchEngine", id, i18n.t("engine.switched", { name: engineDisplayName(getSearchEngine(id, this.customEngines)) }));
  }

  /**
   * Reads the installed browsers once per session.
   *
   * Detection is a registry read, so repeating it would be cheap — but it would
   * also make the picker's rows arrive again under the cursor for no reason,
   * and what is installed cannot change while the app is running.
   */
  loadBrowsers(): Promise<void> {
    this.browserLoad ??= this.readBrowsers();
    return this.browserLoad;
  }

  /** Puts the highlight on the browser that links currently open in. */
  selectCurrentBrowser() {
    const index = this.browserOptions.findIndex((option) => option.path === this.browserPath);
    this.selectedIndex = index >= 0 ? index : 0;
  }

  async setBrowser(path: string): Promise<boolean> {
    return this.patch(
      "browser",
      path,
      i18n.t("settings.browser.switched", {
        name: browserDisplayName(path, this.installedBrowsers),
      }),
    );
  }

  async setTheme(id: ThemeId): Promise<boolean> {
    const ok = await this.patch("theme", id, i18n.t("theme.switched", { name: id === "light" ? i18n.t("theme.light") : i18n.t("theme.dark") }));
    if (ok) applyTheme(id);
    return ok;
  }

  /**
   * Persists the target the translate panel picked with Tab.
   *
   * Deliberately quiet: that panel writes its own footer, and the settings
   * list's "return to the list" timer has nothing to do with it.
   */
  async setTranslateTarget(code: string): Promise<boolean> {
    await this.ready;
    try {
      const next = await invoke<AppSettings>("update_setting", { key: "translateTarget", value: code });
      this.apply(next);
      return true;
    } catch {
      ui.flash(i18n.t("translate.targetSaveFailed"));
      return false;
    }
  }

  async setLocale(id: LocalePref): Promise<boolean> {
    await this.ready;
    try {
      const next = await invoke<AppSettings>("update_setting", { key: "locale", value: id });
      this.apply(next);
      this.flash(i18n.t("settings.language.switched", { name: this.prefLabel(id) }));
      this.scheduleReturn();
      return true;
    } catch {
      this.flash(i18n.t("settings.saveFail"));
      return false;
    }
  }

  async setClipRetention(days: ClipRetentionDays): Promise<boolean> {
    return this.patch(
      "clipTextRetentionDays",
      String(days),
      i18n.t("settings.clipRetention.saved", { name: this.retentionPrefLabel(days) }),
    );
  }

  async captureHotkey(event: KeyboardEvent): Promise<boolean> {
    const shortcut = eventToHotkey(event);
    if (!shortcut) return false;
    event.preventDefault();
    event.stopPropagation();
    await this.ready;
    try {
      const next = await invoke<AppSettings>("update_setting", {
        key: "hotkey",
        value: shortcut,
      });
      this.apply(next);
      this.recording = false;
      this.flash(i18n.t("hotkey.set", { value: formatHotkey(shortcut) }));
      this.scheduleReturn();
      return true;
    } catch {
      this.flash(i18n.t("hotkey.taken"));
      return false;
    }
  }

  async startRecording(): Promise<void> {
    if (this.recording) return;
    await this.ready;
    try {
      await invoke("begin_hotkey_capture");
      this.recording = true;
    } catch {
      this.flash(i18n.t("hotkey.recordFail"));
    }
  }

  async stopRecording(): Promise<void> {
    if (!this.recording) return;
    this.recording = false;
    try {
      await invoke("cancel_hotkey_capture");
    } catch {
      /* restore is best-effort */
    }
  }

  async saveEngineDraft(): Promise<boolean> {
    const draft = this.engineDraft;
    if (!draft) return false;
    const name = draft.name.trim();
    const url = draft.url.trim();
    if (!name || !url) return false;
    await this.ready;
    try {
      const next = await invoke<AppSettings>("add_custom_engine", { name, url });
      this.apply(next);
      this.closeEngineDraft();
      this.flash(i18n.t("engine.added", { name }));
      return true;
    } catch {
      this.flash(i18n.t("engine.addFail"));
      return false;
    }
  }

  async removeEngine(id: string): Promise<boolean> {
    await this.ready;
    const current = this.engines.find((engine) => engine.id === id);
    if (!current?.custom) return false;
    try {
      const next = await invoke<AppSettings>("delete_custom_engine", { id });
      this.apply(next);
      this.flash(i18n.t("engine.removed", { name: current.name }));
      return true;
    } catch {
      this.flash(i18n.t("settings.saveFail"));
      return false;
    }
  }

  /** Writes the current data into the app's own backup folder. */
  async createBackup(): Promise<void> {
    await this.ready;
    try {
      const file = await invoke<BackupFile>("create_backup", { stamp: backupStamp(new Date()) });
      await this.loadBackups();
      // Put the highlight on what was just written, so the panel answers "where
      // did it go" without the user having to look for it.
      const index = this.backups.findIndex((entry) => entry.path === file.path);
      this.selectedIndex = index >= 0 ? index + 1 : 1;
      ui.flash(i18n.t("settings.backup.created", { name: file.name }));
    } catch {
      ui.flash(i18n.t("settings.backup.writeFail"));
    }
  }

  /** Writes the current data to a location the user picks, outside the folder. */
  async saveBackupCopy(): Promise<void> {
    await this.ready;
    try {
      const path = await invoke<string | null>("save_backup_copy", {
        stamp: backupStamp(new Date()),
      });
      if (path) ui.flash(i18n.t("settings.backup.saved", { path }));
    } catch {
      ui.flash(i18n.t("settings.backup.writeFail"));
    }
  }

  async revealBackups(): Promise<void> {
    try {
      await invoke("open_backups_dir");
    } catch {
      ui.flash(i18n.t("settings.backup.openFail"));
    }
  }

  /** Runs whatever Enter means on the highlighted row of the backup screen. */
  async runBackupRow(index: number): Promise<void> {
    const row = this.backupRows[index];
    if (!row) return;
    if (row.kind === "create") return this.createBackup();
    if (row.kind === "import") return this.openImportDraft();
    if (row.kind === "saveAs") return this.saveBackupCopy();
    if (row.kind === "folder") return this.revealBackups();
    if (row.file?.valid) {
      this.confirmImport(row.file.path, backupLabel(row.file.exportedAt));
      return;
    }
    // The row says it cannot be read, and Enter must not pretend otherwise.
    ui.flash(i18n.t("settings.backup.fail"));
  }

  openImportDraft() {
    this.importDraft = { path: "" };
    this.importPreview = null;
    ui.focusField = "backup-path";
  }

  closeImportDraft() {
    this.cancelPreview();
    this.importDraft = null;
    this.importPreview = null;
    ui.focusField = "search";
  }

  /**
   * Reads the file behind the path being typed, so the screen can describe it.
   *
   * The value comes from the event rather than from the draft, because the
   * binding that writes the draft is a listener on the same element and the
   * order of the two is not something to depend on.
   */
  previewImportPath(value: string): void {
    const path = value.trim();
    this.cancelPreview();
    this.importPreview = null;
    if (!path) return;
    // Typing a path is a keystroke per character, and each one would be a file
    // read; the wait is short enough to feel immediate and long enough to skip
    // every prefix of what is being typed.
    this.previewTimer = setTimeout(() => {
      this.previewTimer = null;
      void this.inspectImport(path);
    }, 250);
  }

  async pickBackupFile(): Promise<void> {
    try {
      const path = await invoke<string | null>("pick_backup_file");
      if (!path || !this.importDraft) return;
      this.importDraft.path = path;
      this.previewImportPath(path);
    } catch {
      ui.flash(i18n.t("settings.backup.fail"));
    }
  }

  /** Enter on the import screen: read the file, then ask before replacing. */
  async submitImportDraft(): Promise<void> {
    const path = this.importDraft?.path.trim() ?? "";
    if (!path) return;
    const file = await this.inspectImport(path);
    if (file) this.confirmImport(file.path, backupLabel(file.exportedAt));
  }

  async loadBackups(): Promise<void> {
    try {
      this.backups = await invoke<BackupFile[]>("list_backups");
    } catch {
      // An unreadable folder leaves the panel with its action rows and no files,
      // which is honest about what the app can see; creating one then reports
      // the write failure, which is the actionable half of the same problem.
      this.backups = [];
    }
  }

  async reload(): Promise<void> {
    try {
      const next = await invoke<AppSettings>("get_settings");
      this.apply(next);
    } catch {
      /* keep in-memory settings */
    }
  }

  private cancelPreview() {
    if (this.previewTimer) {
      clearTimeout(this.previewTimer);
      this.previewTimer = null;
    }
  }

  private async inspectImport(path: string): Promise<BackupFile | null> {
    try {
      const file = await invoke<BackupFile>("inspect_backup", { path });
      // The path may have been edited while the read was in flight; a preview of
      // the previous one would be a description of a file nobody is looking at.
      if (this.importDraft?.path.trim() === path) {
        this.importPreview = { kind: "ok", file };
      }
      return file;
    } catch {
      if (this.importDraft?.path.trim() === path) {
        this.importPreview = { kind: "bad" };
      }
      return null;
    }
  }

  /**
   * The second Enter before anything is replaced, in the app's one dialog.
   *
   * The body names the data on screen rather than the data in the file: that is
   * what the import takes away, and the file itself is already described by the
   * row — or, for a typed path, by the line under the field.
   */
  private confirmImport(path: string, name: string) {
    const current = backupCounts(todos.todos.length, snippets.items.length);
    ui.requestConfirm(
      i18n.t("settings.backup.restore", { name }),
      () => void this.restoreBackup(path, name),
      i18n.t("settings.backup.restoreBody", { current }),
    );
  }

  private async restoreBackup(path: string, name: string): Promise<void> {
    try {
      await invoke("import_backup_from", { path, stamp: backupStamp(new Date()) });
    } catch {
      // Past this point the file has already been read and shown as a valid
      // backup, so what is left to fail is the writing: the snapshot, the three
      // files, or the imported hotkey.
      ui.flash(i18n.t("settings.backup.writeFail"));
      return;
    }
    await todos.reload();
    await snippets.reload();
    await this.reload();
    await this.loadBackups();
    this.closeImportDraft();
    ui.flash(i18n.t("settings.backup.restored", { name }));
  }

  private async readBrowsers() {
    try {
      this.installedBrowsers = await invoke<InstalledBrowser[]>("list_browsers");
    } catch {
      // Detection finding nothing is a real outcome, and the picker has a
      // message for it; failing the whole screen over a registry read would
      // look broken instead.
      this.installedBrowsers = [];
    } finally {
      this.browsersLoaded = true;
    }
  }

  private async patch(key: string, value: string, message: string, stay = false): Promise<boolean> {
    await this.ready;
    try {
      const next = await invoke<AppSettings>("update_setting", { key, value });
      this.apply(next);
      this.flash(message);
      if (!stay) this.scheduleReturn();
      return true;
    } catch {
      // The caller discards the boolean, so without this a failed write looked
      // like the key press had not registered at all.
      this.flash(i18n.t("settings.saveFail"));
      return false;
    }
  }

  private scheduleReturn() {
    this.cancelReturn();
    this.returnTimer = setTimeout(() => {
      this.returnTimer = null;
      if (ui.view === "settings") {
        ui.searchText = "settings ";
        ui.focusField = "search";
      }
    }, 1500);
  }

  private flash(message: string) {
    this.notice = message;
    if (this.noticeTimer) clearTimeout(this.noticeTimer);
    this.noticeTimer = setTimeout(() => {
      this.notice = null;
      this.noticeTimer = null;
    }, 1500);
  }

  private apply(next: AppSettings) {
    this.engineId = next.defaultSearchEngine || "bing";
    this.theme = next.theme === "light" ? "light" : "dark";
    this.hotkey = next.hotkey?.trim() ?? "";
    this.localePref = parseLocalePref(next.locale);
    // Rust normalizes this against the codes it accepts, so anything left here
    // is already either valid or empty; empty means the user has not chosen.
    this.translateTarget = next.translateTarget?.trim() ?? "";
    // Rust normalizes this too: anything left here is an executable that
    // existed when the settings were last written, or empty for the system
    // default.
    this.browserPath = next.browser?.trim() ?? "";
    this.customEngines = (next.customSearchEngines ?? []).map((engine) => ({
      id: engine.id,
      name: engine.name,
      url: engine.url,
      custom: true,
    }));
    applyTheme(this.theme);
    this.syncLocale();
    this.clipTextRetentionDays = parseClipRetentionDays(next.clipTextRetentionDays);
  }

  private syncLocale() {
    i18n.locale = resolveLocale(this.localePref);
    if (typeof document !== "undefined") {
      document.documentElement.lang = i18n.locale;
    }
    void invoke("update_tray_menu", {
      show: i18n.t("tray.show"),
      quit: i18n.t("tray.quit"),
    }).catch(() => {});
  }

  private async hydrate() {
    try {
      this.apply(await invoke<AppSettings>("get_settings"));
    } catch {
      this.engineId = "bing";
      this.theme = "dark";
      this.hotkey = "";
      this.localePref = "system";
      this.translateTarget = "";
      this.browserPath = "";
      this.customEngines = [];
      this.clipTextRetentionDays = 7;
      applyTheme("dark");
      this.syncLocale();
    }
  }
}

export const settings = new SettingsStore();
