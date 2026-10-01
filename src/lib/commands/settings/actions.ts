import { parseSettingsScreen } from "$lib/commands/settings/parse";
import type { SearchEngine } from "$lib/commands/settings/engines";
import { i18n } from "$lib/i18n";
import { clipboard } from "$lib/stores/clipboard.svelte";
import { settings, type SettingItem } from "$lib/stores/settings.svelte";
import { ui } from "$lib/stores/ui.svelte";
import { update } from "$lib/stores/update.svelte";

type SettingItemId = SettingItem["id"];

export function openEngineSettings(): void {
  ui.searchText = "settings engine";
  ui.focusField = "search";
}

export function openBrowserSettings(): void {
  ui.searchText = "settings browser";
  ui.focusField = "search";
}

export function openThemeSettings(): void {
  ui.searchText = "settings theme";
  ui.focusField = "search";
}

export function openHotkeySettings(): void {
  ui.searchText = "settings hotkey";
  ui.focusField = "search";
}

export function openLanguageSettings(): void {
  ui.searchText = "settings language";
  ui.focusField = "search";
}

export function openRetentionSettings(): void {
  ui.searchText = "settings retention";
  ui.focusField = "search";
}

export function startClipCleanup(): void {
  const days = settings.clipTextRetentionDays;
  if (days <= 0) {
    ui.flash(i18n.t("clip.cleanupDisabledHint"));
    return;
  }
  clipboard.openExpireConfirm(days);
}

/**
 * Removing a custom engine throws away the name and URL that were typed in, so
 * both ways in — the Delete key and the row's own button — ask first, like the
 * system commands do.
 */
export function confirmRemoveEngine(engine: SearchEngine | undefined): void {
  if (!engine?.custom) return;
  ui.requestConfirm(
    engine.name,
    () => void settings.removeEngine(engine.id),
    i18n.t("settings.engineDeleteBody"),
  );
}

export function startEngineCreate(): void {
  if (parseSettingsScreen(ui.commandRest) !== "engine") {
    openEngineSettings();
  }
  settings.openEngineCreate();
}

export function closeSettingsDrill(): boolean {
  if (ui.view !== "settings") return false;
  // Leaving any settings screen cancels the pending "return to the list": it
  // belongs to the screen the save happened on, not to whatever the user moved
  // to next.
  settings.cancelReturn();
  if (settings.engineDraft) {
    settings.closeEngineDraft();
    return true;
  }

  if (settings.recording) {
    void settings.stopRecording();
    ui.searchText = "settings ";
    ui.focusField = "search";
    return true;
  }
  if (parseSettingsScreen(ui.commandRest) === "list") return false;
  ui.searchText = "settings ";
  ui.focusField = "search";
  return true;
}

/**
 * What a settings row does, whether it was opened by Enter or by a click.
 *
 * One function rather than the same nine branches in the panel and in the
 * key handler: two copies of "which row opens what" is how a row ends up
 * meaning one thing to the mouse and another to the keyboard.
 */
export function runSettingItem(id: SettingItemId): void {
  if (id === "engine") return openEngineSettings();
  if (id === "browser") return openBrowserSettings();
  if (id === "theme") return openThemeSettings();
  if (id === "hotkey") return openHotkeySettings();
  if (id === "language") return openLanguageSettings();
  if (id === "retention") return openRetentionSettings();
  if (id === "cleanup") return startClipCleanup();
  // These three act on the list rather than opening a screen of their own:
  // there is nothing between the keystroke and the dialog or the check.
  if (id === "export") {
    void settings.exportSettings();
    return;
  }
  if (id === "import") {
    void settings.importSettings();
    return;
  }
  void update.checkNow();
}

export async function handleSettingsEnter(): Promise<void> {
  if (settings.engineDraft) {
    await settings.saveEngineDraft();
    return;
  }

  const screen = parseSettingsScreen(ui.commandRest);
  if (screen === "engine") {
    const engine = settings.engines[settings.selectedIndex];
    if (engine) await settings.setEngine(engine.id);
    return;
  }
  if (screen === "browser") {
    const option = settings.browserOptions[settings.selectedIndex];
    if (option) await settings.setBrowser(option.path);
    return;
  }
  if (screen === "theme") {
    const theme = settings.themes[settings.selectedIndex];
    if (theme) await settings.setTheme(theme.id);
    return;
  }
  if (screen === "hotkey") return;
  if (screen === "language") {
    const option = settings.locales[settings.selectedIndex];
    if (option) await settings.setLocale(option.id);
    return;
  }
  if (screen === "retention") {
    const option = settings.retentionOptions[settings.selectedIndex];
    if (option) await settings.setClipRetention(option.id);
    return;
  }

  const item = settings.listItems[settings.selectedIndex];
  if (item) runSettingItem(item.id);
}
