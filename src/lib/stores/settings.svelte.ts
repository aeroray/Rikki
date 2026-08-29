import { invoke } from "@tauri-apps/api/core";
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
import {
  parseTargetLangCode,
  preferredTranslateLang,
  translateLangKey,
  type TargetLangCode,
} from "$lib/commands/translate/parse";
import { i18n } from "$lib/i18n";
import { parseLocalePref, resolveLocale, type LocalePref } from "$lib/i18n/locale";
import { parseClipRetentionDays, type ClipRetentionDays } from "$lib/commands/clip/cleanup";
import type { AppSettings } from "$lib/commands/types";
import { snippets } from "$lib/stores/snippets.svelte";
import { todos } from "$lib/stores/todos.svelte";
import { ui } from "$lib/stores/ui.svelte";

export type SettingItem = {
  id: "engine" | "theme" | "hotkey" | "language" | "translate" | "retention" | "cleanup" | "export" | "import";
  title: string;
  value: string;
  icon: "Globe" | "Palette" | "Keyboard" | "Languages" | "KeyRound" | "Timer" | "Eraser" | "Download" | "Upload";
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

export type TranslateDraft = {
  appId: string;
  secret: string;
  url: string;
};

const DEFAULT_TRANSLATE_URL = "https://api.fanyi.baidu.com/api/trans/vip/translate";

class SettingsStore {
  engineId = $state("bing");
  theme = $state<ThemeId>("dark");
  hotkey = $state("");
  localePref = $state<LocalePref>("system");
  baiduAppId = $state("");
  baiduSecret = $state("");
  translateApiUrl = $state(DEFAULT_TRANSLATE_URL);
  translateDefaultTarget = $state<TargetLangCode>("zh");
  translateSecondTarget = $state<TargetLangCode>("en");
  clipTextRetentionDays = $state<ClipRetentionDays>(7);
  customEngines = $state<SearchEngine[]>([]);
  selectedIndex = $state(0);
  notice = $state<string | null>(null);
  recording = $state(false);
  engineDraft = $state<EngineDraft | null>(null);
  translateDraft = $state<TranslateDraft | null>(null);
  private ready: Promise<void>;
  private noticeTimer: ReturnType<typeof setTimeout> | null = null;
  private returnTimer: ReturnType<typeof setTimeout> | null = null;
  private persistTimers = new Map<string, ReturnType<typeof setTimeout>>();
  private persistPending = new Map<string, string>();

  constructor() {
    this.ready = this.hydrate();
    ui.onHideFlush(() => {
      void this.flushTranslatePersist();
    });
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

  readonly translateConfigured = $derived(Boolean(this.baiduAppId.trim() && this.baiduSecret.trim()));

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
      id: "translate",
      title: i18n.t("settings.translate"),
      value: this.translateConfigured ? i18n.t("settings.translate.configured") : i18n.t("settings.translate.missing"),
      icon: "KeyRound",
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

  openTranslateDraft() {
    this.translateDraft = {
      appId: this.baiduAppId,
      secret: this.baiduSecret,
      url: this.translateApiUrl || DEFAULT_TRANSLATE_URL,
    };
    if (!this.baiduAppId.trim()) ui.focusField = "translate-appid";
    else if (!this.baiduSecret.trim()) ui.focusField = "translate-secret";
    else ui.focusField = "translate-appid";
  }

  closeTranslateDraft() {
    void this.flushTranslatePersist();
    this.translateDraft = null;
    ui.focusField = "search";
  }

  queueTranslateField(
    key: "baiduTranslateAppId" | "baiduTranslateSecretKey" | "translationApiUrl",
    value: string,
  ) {
    if (key === "baiduTranslateAppId") this.baiduAppId = value;
    else if (key === "baiduTranslateSecretKey") this.baiduSecret = value;
    else this.translateApiUrl = value;
    this.persistPending.set(key, value);
    const previous = this.persistTimers.get(key);
    if (previous) clearTimeout(previous);
    this.persistTimers.set(
      key,
      setTimeout(() => {
        this.persistTimers.delete(key);
        void this.flushTranslateKey(key);
      }, 280),
    );
  }

  async flushTranslatePersist(): Promise<void> {
    const keys = [...this.persistPending.keys()];
    for (const key of keys) await this.flushTranslateKey(key);
  }

  private async flushTranslateKey(key: string): Promise<void> {
    const value = this.persistPending.get(key);
    if (value === undefined) return;
    this.persistPending.delete(key);
    const timer = this.persistTimers.get(key);
    if (timer) {
      clearTimeout(timer);
      this.persistTimers.delete(key);
    }
    const persistValue = key === "translationApiUrl" ? value.trim() || DEFAULT_TRANSLATE_URL : value.trim();
    if (key === "translationApiUrl" && persistValue && !persistValue.startsWith("https://api.fanyi.baidu.com/")) {
      return;
    }
    await this.ready;
    try {
      await invoke<AppSettings>("update_setting", { key, value: persistValue });
    } catch {
      this.flash(i18n.t("settings.translate.saveFail"));
    }
  }

  async setEngine(id: string): Promise<boolean> {
    return this.patch("defaultSearchEngine", id, i18n.t("engine.switched", { name: engineDisplayName(getSearchEngine(id, this.customEngines)) }));
  }

  async setTheme(id: ThemeId): Promise<boolean> {
    const ok = await this.patch("theme", id, i18n.t("theme.switched", { name: id === "light" ? i18n.t("theme.light") : i18n.t("theme.dark") }));
    if (ok) applyTheme(id);
    return ok;
  }

  async setTranslateDefaultTarget(id: string): Promise<boolean> {
    const code = parseTargetLangCode(id);
    if (!code) return false;
    this.cancelReturn();
    return this.patch(
      "translateDefaultTarget",
      code,
      i18n.t("settings.translate.langSaved", { name: i18n.t(translateLangKey(code)) }),
      true,
    );
  }

  async setTranslateSecondTarget(id: string): Promise<boolean> {
    const code = parseTargetLangCode(id);
    if (!code) return false;
    this.cancelReturn();
    return this.patch(
      "translateSecondTarget",
      code,
      i18n.t("settings.translate.langSaved", { name: i18n.t(translateLangKey(code)) }),
      true,
    );
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
      return false;
    }
  }

  async exportBackup(): Promise<void> {
    await this.ready;
    try {
      const ok = await invoke<boolean>("export_backup");
      if (ok) this.flash(i18n.t("settings.export.ok"));
    } catch {
      this.flash(i18n.t("settings.export.fail"));
    }
  }

  async importBackup(): Promise<void> {
    await this.ready;
    this.discardPendingTranslatePersist();
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

  private discardPendingTranslatePersist() {
    for (const timer of this.persistTimers.values()) clearTimeout(timer);
    this.persistTimers.clear();
    this.persistPending.clear();
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
    if (!this.persistPending.has("baiduTranslateAppId")) {
      this.baiduAppId = next.baiduTranslateAppId?.trim() ?? "";
    }
    if (!this.persistPending.has("baiduTranslateSecretKey")) {
      this.baiduSecret = next.baiduTranslateSecretKey?.trim() ?? "";
    }
    if (!this.persistPending.has("translationApiUrl")) {
      this.translateApiUrl = next.translationApiUrl?.trim() || DEFAULT_TRANSLATE_URL;
    }
    this.customEngines = (next.customSearchEngines ?? []).map((engine) => ({
      id: engine.id,
      name: engine.name,
      url: engine.url,
      custom: true,
    }));
    applyTheme(this.theme);
    this.syncLocale();
    this.translateDefaultTarget = parseTargetLangCode(next.translateDefaultTarget) ?? preferredTranslateLang();
    this.translateSecondTarget = parseTargetLangCode(next.translateSecondTarget) ?? "en";
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
      const next = await invoke<AppSettings>("get_settings");
      const seedDefault = !parseTargetLangCode(next.translateDefaultTarget);
      const seedSecond = !parseTargetLangCode(next.translateSecondTarget);
      this.apply(next);
      if (seedDefault || seedSecond) {
        try {
          if (seedDefault) {
            await invoke<AppSettings>("update_setting", {
              key: "translateDefaultTarget",
              value: this.translateDefaultTarget,
            });
          }
          if (seedSecond) {
            await invoke<AppSettings>("update_setting", {
              key: "translateSecondTarget",
              value: this.translateSecondTarget,
            });
          }
        } catch {
          /* in-memory values still apply until the next save */
        }
      }
    } catch {
      this.engineId = "bing";
      this.theme = "dark";
      this.hotkey = "";
      this.localePref = "system";
      this.baiduAppId = "";
      this.baiduSecret = "";
      this.translateApiUrl = DEFAULT_TRANSLATE_URL;
      this.customEngines = [];
      this.clipTextRetentionDays = 7;
      applyTheme("dark");
      this.syncLocale();
      this.translateDefaultTarget = preferredTranslateLang();
      this.translateSecondTarget = "en";
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
