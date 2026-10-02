import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { disable as disableAutostart, enable as enableAutostart, isEnabled as isAutostartEnabled } from "@tauri-apps/plugin-autostart";
import {
  defaultHotkey,
  getSearchEngine,
  engineDisplayName,
  SEARCH_ENGINES,
  type SearchEngine,
} from "$lib/commands/settings/engines";
import { parseThemePref, resolveTheme, systemPrefersDark } from "$lib/commands/settings/theme";
import { exportStamp, transferCounts } from "$lib/commands/settings/transfer";
import { eventToHotkey, formatHotkey } from "$lib/commands/settings/hotkey";
import { browserDisplayName, browserOptionList } from "$lib/commands/settings/browsers";
import { i18n } from "$lib/i18n";
import { parseLocalePref, resolveLocale, type LocalePref } from "$lib/i18n/locale";
import { parseClipRetentionDays, type ClipRetentionDays } from "$lib/commands/clip/cleanup";
import { parseSettingsScreen, type SettingsScreen } from "$lib/commands/settings/parse";
import type { AppSettings, InstalledBrowser, PickedFile, ThemePref } from "$lib/commands/types";
import { snippets } from "$lib/stores/snippets.svelte";
import { todos } from "$lib/stores/todos.svelte";
import { ui, type NoticeTone } from "$lib/stores/ui.svelte";
import { update } from "$lib/stores/update.svelte";

export type SettingItem = {
  id:
    | "engine"
    | "browser"
    | "theme"
    | "hotkey"
    | "autostart"
    | "language"
    | "retention"
    | "cleanup"
    | "export"
    | "import"
    | "update";
  title: string;
  value: string;
  icon:
    | "Globe"
    | "Compass"
    | "Palette"
    | "Keyboard"
    | "Rocket"
    | "Languages"
    | "Timer"
    | "Eraser"
    | "Download"
    | "Upload"
    | "RefreshCw";
  current?: boolean;
};

export type ThemeOption = {
  id: ThemePref;
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
  theme = $state<ThemePref>("system");
  /**
   * What the OS is asking for, kept live so `system` can follow a change made
   * while the palette is running — a scheduled light/dark switch, or the user
   * flipping it in the OS settings.
   */
  private prefersDark = $state(systemPrefersDark());
  hotkey = $state("");
  localePref = $state<LocalePref>("system");
  translateTarget = $state("");
  browserPath = $state("");
  installedBrowsers = $state<InstalledBrowser[]>([]);
  /** False until `list_browsers` has answered, so an empty list can be told
   * apart from a list that has not arrived yet. */
  browsersLoaded = $state(false);
  clipTextRetentionDays = $state<ClipRetentionDays>(7);
  /**
   * Whether the app is registered as a login item.
   *
   * The OS holds this, not `settings.json`: the login item is a fact about the
   * machine, and a copy in our own file would be a claim we could not check. The
   * value here is only ever what the plugin reported back.
   */
  autostartEnabled = $state(false);
  customEngines = $state<SearchEngine[]>([]);
  selectedIndex = $state(0);
  notice = $state<string | null>(null);
  /** Whether that notice is good news, which decides its glyph in the footer. */
  noticeTone = $state<NoticeTone>("info");
  recording = $state(false);
  engineDraft = $state<EngineDraft | null>(null);
  private ready: Promise<void>;
  private browserLoad: Promise<void> | null = null;
  private noticeTimer: ReturnType<typeof setTimeout> | null = null;
  private returnTimer: ReturnType<typeof setTimeout> | null = null;
  /** Bumped by every start and every stop, so a start that is still in flight
   * can tell that the screen it was arming for has gone away. */
  private captureToken = 0;

  constructor() {
    this.ready = this.hydrate();
    // `system` has to keep following the OS after boot rather than only at it:
    // the switch can arrive while the palette is hidden, and the next show
    // should already be in the right theme.
    if (typeof window !== "undefined" && typeof window.matchMedia === "function") {
      window.matchMedia("(prefers-color-scheme: dark)").addEventListener("change", (event) => {
        this.prefersDark = event.matches;
      });
    }
    // The settings row shows the chosen browser by name, so the list is needed
    // before the picker is ever opened. Detection is a registry read, not an
    // app scan, so this is cheap enough to start with the rest of the boot.
    void this.loadBrowsers();
    // Read once at boot rather than when the settings list is opened: the row has
    // to be right the first time it is drawn, and a value that arrived a frame
    // later would flicker between the two labels.
    void this.loadAutostart();
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

  /** The theme actually painted, which is what the layout and the labels use. */
  readonly resolvedTheme = $derived(resolveTheme(this.theme, this.prefersDark));

  readonly themes = $derived<ThemeOption[]>([
    { id: "system", name: i18n.t("theme.system") },
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

  readonly autostartLabel = $derived(
    i18n.t(this.autostartEnabled ? "settings.autostart.on" : "settings.autostart.off"),
  );

  /**
   * What the settings row shows.
   *
   * Following the system names the theme it currently resolves to, because
   * "System" on its own does not tell the user what they are looking at.
   */
  readonly themeLabel = $derived.by(() => {
    if (this.theme !== "system") return this.themeName(this.theme);
    const painted = i18n.t(this.resolvedTheme === "light" ? "theme.light" : "theme.dark");
    return i18n.t("theme.systemNow", { name: painted });
  });

  private themeName(pref: ThemePref): string {
    if (pref === "light") return i18n.t("theme.light");
    if (pref === "dark") return i18n.t("theme.dark");
    return i18n.t("theme.system");
  }

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
      id: "autostart",
      title: i18n.t("settings.autostart"),
      value: this.autostartLabel,
      icon: "Rocket",
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
      value: i18n.t("settings.export.value"),
      icon: "Download",
      current: false,
    },
    {
      id: "import",
      title: i18n.t("settings.import"),
      value: i18n.t("settings.import.value"),
      icon: "Upload",
      current: false,
    },
    {
      id: "update",
      title: i18n.t("settings.update"),
      // Three states, in the order the user cares about them: what is happening
      // right now, what is waiting to be installed, and what they already have.
      // The running version comes from the binary, so an empty one means the read
      // has not answered yet rather than that there is no version.
      value: update.checking
        ? i18n.t("settings.update.checking")
        : update.available
          ? i18n.t("update.available", { version: update.available })
          : update.version
            ? i18n.t("settings.update.value", { version: update.version })
            : "",
      icon: "RefreshCw",
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

  async setTheme(id: ThemePref): Promise<boolean> {
    return this.patch("theme", id, i18n.t("theme.switched", { name: this.themeName(id) }));
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
      this.flash(i18n.t("settings.language.switched", { name: this.prefLabel(id) }), "success");
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

  /**
   * Turns the login item on or off, and reports what the OS actually did.
   *
   * The value is read back rather than assumed: on macOS the LaunchAgent write
   * can fail, and on Windows the `Run` value belongs to the machine rather than
   * to this process — so a row showing the *requested* state would be the one
   * place the user could be told something untrue about a setting they cannot
   * check anywhere else in the app.
   *
   * No `scheduleReturn()`: unlike the pickers this row opens no screen, so there
   * is nowhere to return to and the jump would only cut the notice short.
   */
  async setAutostart(enabled: boolean): Promise<boolean> {
    await this.ready;
    try {
      if (enabled) await enableAutostart();
      else await disableAutostart();
      this.autostartEnabled = await isAutostartEnabled();
      this.flash(
        i18n.t(this.autostartEnabled ? "settings.autostart.on" : "settings.autostart.off"),
        "success",
      );
      return true;
    } catch {
      this.flash(i18n.t("settings.autostart.failed"));
      return false;
    }
  }

  /**
   * Re-reads the login item from the OS.
   *
   * Called at boot and every time the settings panel is opened, because the
   * entry can be removed from outside the app — Task Manager's Startup tab,
   * `msconfig`, macOS's Login Items — and a stale "on" would be a claim the user
   * has no way to correct from here.
   */
  async loadAutostart(): Promise<void> {
    try {
      this.autostartEnabled = await isAutostartEnabled();
    } catch {
      // No runtime, or the plugin is not permitted. Off is the state a fresh
      // install is in, and the row is then at least not claiming otherwise.
      this.autostartEnabled = false;
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
      this.flash(i18n.t("hotkey.set", { value: formatHotkey(shortcut) }), "success");
      this.scheduleReturn();
      return true;
    } catch {
      this.flash(i18n.t("hotkey.taken"));
      return false;
    }
  }

  async startRecording(): Promise<void> {
    if (this.recording) return;
    const token = ++this.captureToken;
    await this.ready;
    try {
      await invoke("begin_hotkey_capture");
    } catch {
      if (token === this.captureToken) this.flash(i18n.t("hotkey.recordFail"));
      return;
    }
    // The screen can be left while the capture is still being armed, and the
    // cleanup that ran on the way out saw `recording` false, so it could not
    // cancel a capture that had not started. Undo it here instead: leaving it up
    // would unregister the palette's own shortcut with nothing listening for a
    // replacement.
    if (token !== this.captureToken) {
      void invoke("cancel_hotkey_capture").catch(() => {});
      return;
    }
    this.recording = true;
  }

  async stopRecording(): Promise<void> {
    this.captureToken += 1;
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
      this.flash(i18n.t("engine.added", { name }), "success");
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
      this.flash(i18n.t("engine.removed", { name: current.name }), "success");
      return true;
    } catch {
      this.flash(i18n.t("settings.saveFail"));
      return false;
    }
  }

  /**
   * Writes the current data to a file the user names.
   *
   * No confirmation, because the save dialog already is one: it asks where and
   * what to call it, it can be cancelled, and it cannot destroy anything the app
   * holds. The app's rule is that confirmation is for what cannot be undone.
   */
  async exportSettings(): Promise<void> {
    await this.ready;
    try {
      const path = await invoke<string | null>("export_settings", {
        stamp: exportStamp(new Date()),
      });
      if (path) this.flash(i18n.t("settings.export.saved", { path }), "success");
    } catch {
      this.flash(i18n.t("settings.export.fail"));
    }
  }

  /**
   * Picks a file, then asks before anything is replaced.
   *
   * The picker reads the file as it returns it, so a file that is not one of
   * ours is refused while the data on screen is still untouched. The
   * confirmation that follows is the app's one dialog, and it names both sides:
   * the file the user chose and the data it takes away.
   */
  async importSettings(): Promise<void> {
    await this.ready;
    let picked: PickedFile | null;
    try {
      picked = await invoke<PickedFile | null>("pick_import_file");
    } catch {
      this.flash(i18n.t("settings.import.invalid"));
      return;
    }
    if (!picked) return;
    const current = transferCounts(todos.todos.length, snippets.items.length);
    ui.requestConfirm(
      i18n.t("settings.import.confirm"),
      () => void this.applyImport(picked.path, picked.name),
      i18n.t("settings.import.body", { name: picked.name, current }),
    );
  }

  async reload(): Promise<void> {
    try {
      const next = await invoke<AppSettings>("get_settings");
      this.apply(next);
    } catch {
      /* keep in-memory settings */
    }
  }

  private async applyImport(path: string, name: string): Promise<void> {
    try {
      await invoke("import_settings", { path });
    } catch {
      // The file was read and validated when it was picked, so what is left to
      // fail is the writing: the three files, or the imported hotkey.
      this.flash(i18n.t("settings.import.fail"));
      return;
    }
    await todos.reload();
    await snippets.reload();
    await this.reload();
    this.flash(i18n.t("settings.import.restored", { name }), "success");
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

  private async patch(key: string, value: string, message: string): Promise<boolean> {
    await this.ready;
    try {
      const next = await invoke<AppSettings>("update_setting", { key, value });
      this.apply(next);
      this.flash(message, "success");
      this.scheduleReturn();
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
    // The screen the save happened on. The timer only takes the user back there
    // if they are still on it: a save is followed by a second or so of reading
    // the notice, and in that time Ctrl+N opens the engine form and the arrows
    // can be walked somewhere else — dropping them on the settings list from
    // there would overwrite a deliberate move.
    const screen = parseSettingsScreen(ui.commandRest);
    this.returnTimer = setTimeout(() => {
      this.returnTimer = null;
      if (ui.view === "settings" && !this.engineDraft && parseSettingsScreen(ui.commandRest) === screen) {
        ui.searchText = "settings ";
        ui.focusField = "search";
      }
    }, 1500);
  }

  private flash(message: string, tone: NoticeTone = "info") {
    this.notice = message;
    this.noticeTone = tone;
    if (this.noticeTimer) clearTimeout(this.noticeTimer);
    this.noticeTimer = setTimeout(() => {
      this.notice = null;
      this.noticeTone = "info";
      this.noticeTimer = null;
    }, 1500);
  }

  private apply(next: AppSettings) {
    this.engineId = next.defaultSearchEngine || "bing";
    this.theme = parseThemePref(next.theme);
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
      this.theme = "system";
      this.hotkey = "";
      this.localePref = "system";
      this.translateTarget = "";
      this.browserPath = "";
      this.customEngines = [];
      this.clipTextRetentionDays = 7;
      this.syncLocale();
    }
  }
}

export const settings = new SettingsStore();
