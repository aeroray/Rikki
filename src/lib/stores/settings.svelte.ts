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
import { eventToHotkey, formatHotkey } from "$lib/commands/settings/hotkey";
import { i18n } from "$lib/i18n";
import { parseLocalePref, resolveLocale, type LocalePref } from "$lib/i18n/locale";
import { parseClipRetentionDays, type ClipRetentionDays } from "$lib/commands/clip/cleanup";
import type { SettingsScreen } from "$lib/commands/settings/parse";
import type { AppSettings } from "$lib/commands/types";
import { snippets } from "$lib/stores/snippets.svelte";
import { todos } from "$lib/stores/todos.svelte";
import { ui } from "$lib/stores/ui.svelte";

export type SettingItem = {
  id: "engine" | "theme" | "hotkey" | "language" | "retention" | "cleanup" | "export" | "import";
  title: string;
  value: string;
  icon: "Globe" | "Palette" | "Keyboard" | "Languages" | "Timer" | "Eraser" | "Download" | "Upload";
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
  clipTextRetentionDays = $state<ClipRetentionDays>(7);
  customEngines = $state<SearchEngine[]>([]);
  selectedIndex = $state(0);
  notice = $state<string | null>(null);
  recording = $state(false);
  engineDraft = $state<EngineDraft | null>(null);
  private ready: Promise<void>;
  private noticeTimer: ReturnType<typeof setTimeout> | null = null;
  private returnTimer: ReturnType<typeof setTimeout> | null = null;

  constructor() {
    this.ready = this.hydrate();
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

  readonly hotkeyLabel = $derived(formatHotkey(this.hotkey || defaultHotkey()));

  readonly themeLabel = $derived(this.theme === "light" ? i18n.t("theme.light") : i18n.t("theme.dark"));

  readonly localeLabel = $derived(this.prefLabel(this.localePref));

  readonly retentionLabel = $derived(this.retentionPrefLabel(this.clipTextRetentionDays));

  readonly listItems = $derived.by((): SettingItem[] => [
    {
      id: "engine",
      title: i18n.t("settings.engine"),
      value: engineDisplayName(this.engine),
      icon: "Globe",
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
      id: "export",
      title: i18n.t("settings.export"),
      value: i18n.t("settings.backup.scope"),
      icon: "Download",
      current: false,
    },
    {
      id: "import",
      title: i18n.t("settings.import"),
      value: i18n.t("settings.backup.overwrite"),
      icon: "Upload",
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
      case "theme":
        return this.themes.length;
      case "language":
        return this.locales.length;
      case "retention":
        return this.retentionOptions.length;
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

  async exportBackup(): Promise<void> {
    await this.ready;
    try {
      const ok = await invoke<boolean>("export_backup");
      // `false` means the user closed the save dialog. Saying nothing made a
      // cancelled export indistinguishable from a broken one.
      this.flash(ok ? i18n.t("settings.export.ok") : i18n.t("settings.export.cancelled"));
    } catch {
      this.flash(i18n.t("settings.export.fail"));
    }
  }

  async importBackup(): Promise<void> {
    await this.ready;
    try {
      const result = await invoke<BackupImportResult>("import_backup");
      if (result.cancelled) return;
      await todos.reload();
      await snippets.reload();
      if (result.settings && result.settingsValue) this.apply(result.settingsValue);
      else if (result.settings) await this.reload();
      this.flash(backupMessage(result));
    } catch {
      this.flash(i18n.t("settings.import.fail"));
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
      this.customEngines = [];
      this.clipTextRetentionDays = 7;
      applyTheme("dark");
      this.syncLocale();
    }
  }
}

export const settings = new SettingsStore();

type BackupImportResult = {
  cancelled: boolean;
  todos: boolean;
  snippets: boolean;
  settings: boolean;
  settingsValue?: AppSettings | null;
};

function backupMessage(result: BackupImportResult): string {
  const parts: string[] = [];
  if (result.todos) parts.push(i18n.t("settings.backup.todos"));
  if (result.snippets) parts.push(i18n.t("settings.backup.snippets"));
  if (result.settings) parts.push(i18n.t("settings.backup.settings"));
  if (parts.length === 3) return i18n.t("settings.import.ok");
  if (parts.length === 0) return i18n.t("settings.import.fail");
  return i18n.t("settings.import.partial", { parts: parts.join(i18n.t("settings.backup.join")) });
}
