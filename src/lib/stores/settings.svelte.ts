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
import type { AppSettings } from "$lib/commands/types";
import { ui } from "$lib/stores/ui.svelte";

export type SettingItem = {
  id: "engine" | "theme" | "hotkey" | "language" | "translate";
  title: string;
  value: string;
  icon: "Globe" | "Palette" | "Keyboard" | "Languages" | "KeyRound";
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
  customEngines = $state<SearchEngine[]>([]);
  selectedIndex = $state(0);
  notice = $state<string | null>(null);
  recording = $state(false);
  engineDraft = $state<EngineDraft | null>(null);
  translateDraft = $state<TranslateDraft | null>(null);
  private ready: Promise<void>;
  private noticeTimer: ReturnType<typeof setTimeout> | null = null;
  private returnTimer: ReturnType<typeof setTimeout> | null = null;

  constructor() {
    this.ready = this.hydrate();
  }

  readonly themes = $derived<ThemeOption[]>([
    { id: "dark", name: i18n.t("theme.dark") },
    { id: "light", name: i18n.t("theme.light") },
  ]);

  readonly locales: LocaleOption[] = [{ id: "system" }, { id: "zh-CN" }, { id: "en" }];

  readonly engines = $derived.by((): SearchEngine[] => [
    ...SEARCH_ENGINES,
    ...this.customEngines.map((engine) => ({ ...engine, custom: true })),
  ]);

  readonly engine = $derived(getSearchEngine(this.engineId, this.customEngines));

  readonly hotkeyLabel = $derived(formatHotkey(this.hotkey || defaultHotkey()));

  readonly themeLabel = $derived(this.theme === "light" ? i18n.t("theme.light") : i18n.t("theme.dark"));

  readonly localeLabel = $derived(this.prefLabel(this.localePref));

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
  ]);

  prefLabel(pref: LocalePref): string {
    if (pref === "zh-CN") return i18n.t("settings.language.zh");
    if (pref === "en") return i18n.t("settings.language.en");
    return i18n.t("settings.language.system");
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
    ui.focusField = "translate-appid";
  }

  closeTranslateDraft() {
    this.translateDraft = null;
    ui.focusField = "search";
  }

  async saveTranslateDraft(): Promise<boolean> {
    const draft = this.translateDraft;
    if (!draft) return false;
    const appId = draft.appId.trim();
    const secret = draft.secret.trim();
    if (!appId || !secret) return false;
    const url = draft.url.trim() || DEFAULT_TRANSLATE_URL;
    await this.ready;
    try {
      await invoke<AppSettings>("update_setting", { key: "baiduTranslateAppId", value: appId });
      await invoke<AppSettings>("update_setting", { key: "baiduTranslateSecretKey", value: secret });
      const next = await invoke<AppSettings>("update_setting", { key: "translationApiUrl", value: url });
      this.apply(next);
      this.flash(i18n.t("settings.translate.saved"));
      this.scheduleReturn();
      return true;
    } catch {
      this.flash(i18n.t("settings.translate.saveFail"));
      return false;
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
    this.baiduAppId = next.baiduTranslateAppId?.trim() ?? "";
    this.baiduSecret = next.baiduTranslateSecretKey?.trim() ?? "";
    this.translateApiUrl = next.translationApiUrl?.trim() || DEFAULT_TRANSLATE_URL;
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
      applyTheme("dark");
      this.syncLocale();
      this.translateDefaultTarget = preferredTranslateLang();
      this.translateSecondTarget = "en";
    }
  }
}

export const settings = new SettingsStore();
