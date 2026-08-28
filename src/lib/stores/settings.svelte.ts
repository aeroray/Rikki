import { invoke } from "@tauri-apps/api/core";
import {
  applyTheme,
  defaultHotkey,
  getSearchEngine,
  SEARCH_ENGINES,
  type SearchEngine,
  type ThemeId,
} from "$lib/commands/settings/engines";
import { eventToHotkey, formatHotkey } from "$lib/commands/settings/hotkey";
import type { AppSettings } from "$lib/commands/types";
import { ui } from "$lib/stores/ui.svelte";

export type SettingItem = {
  id: "engine" | "theme" | "hotkey";
  title: string;
  value: string;
  icon: "Globe" | "Palette" | "Keyboard";
};

export type ThemeOption = {
  id: ThemeId;
  name: string;
};

export type EngineDraft = {
  name: string;
  url: string;
};

const THEMES: ThemeOption[] = [
  { id: "dark", name: "暗色" },
  { id: "light", name: "亮色" },
];

class SettingsStore {
  engineId = $state("bing");
  theme = $state<ThemeId>("dark");
  hotkey = $state("");
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
  }

  readonly themes = THEMES;

  readonly engines = $derived.by((): SearchEngine[] => [
    ...SEARCH_ENGINES,
    ...this.customEngines.map((engine) => ({ ...engine, custom: true })),
  ]);

  readonly engine = $derived(getSearchEngine(this.engineId, this.customEngines));

  readonly hotkeyLabel = $derived(formatHotkey(this.hotkey || defaultHotkey()));

  readonly themeLabel = $derived(this.theme === "light" ? "亮色" : "暗色");

  readonly listItems = $derived.by((): SettingItem[] => [
    {
      id: "engine",
      title: "默认搜索引擎",
      value: this.engine.name,
      icon: "Globe",
    },
    {
      id: "theme",
      title: "主题",
      value: this.themeLabel,
      icon: "Palette",
    },
    {
      id: "hotkey",
      title: "快捷键",
      value: this.hotkeyLabel,
      icon: "Keyboard",
    },
  ]);

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

  async setEngine(id: string): Promise<boolean> {
    return this.patch("defaultSearchEngine", id, `已切换到 ${getSearchEngine(id, this.customEngines).name}`);
  }

  async setTheme(id: ThemeId): Promise<boolean> {
    const ok = await this.patch("theme", id, `已切换到${id === "light" ? "亮色" : "暗色"}`);
    if (ok) applyTheme(id);
    return ok;
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
      this.flash(`已设为 ${formatHotkey(shortcut)}`);
      this.scheduleReturn();
      return true;
    } catch {
      this.flash("该快捷键无法注册，可能已被占用");
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
      this.flash("无法开始录制快捷键");
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
      this.flash(`已添加「${name}」`);
      return true;
    } catch {
      this.flash("无法添加，URL 需为 http(s) 且包含 %s");
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
      this.flash(`已删除「${current.name}」`);
      return true;
    } catch {
      return false;
    }
  }

  private async patch(key: string, value: string, message: string): Promise<boolean> {
    await this.ready;
    try {
      const next = await invoke<AppSettings>("update_setting", { key, value });
      this.apply(next);
      this.flash(message);
      this.scheduleReturn();
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
    this.customEngines = (next.customSearchEngines ?? []).map((engine) => ({
      id: engine.id,
      name: engine.name,
      url: engine.url,
      custom: true,
    }));
    applyTheme(this.theme);
  }

  private async hydrate() {
    try {
      this.apply(await invoke<AppSettings>("get_settings"));
    } catch {
      this.engineId = "bing";
      this.theme = "dark";
      this.hotkey = "";
      this.customEngines = [];
      applyTheme("dark");
    }
  }
}

export const settings = new SettingsStore();
