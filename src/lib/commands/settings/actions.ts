import { parseSettingsScreen } from "$lib/commands/settings/parse";
import { i18n } from "$lib/i18n";
import { clipboard } from "$lib/stores/clipboard.svelte";
import { settings } from "$lib/stores/settings.svelte";
import { ui } from "$lib/stores/ui.svelte";

export function openEngineSettings(): void {
  ui.searchText = "settings engine";
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

export function openTranslateSettings(): void {
  ui.searchText = "settings translate";
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

export function startEngineCreate(): void {
  if (parseSettingsScreen(ui.commandRest) !== "engine") {
    openEngineSettings();
  }
  settings.openEngineCreate();
}

export function closeSettingsDrill(): boolean {
  if (ui.view !== "settings") return false;
  if (settings.engineDraft) {
    settings.closeEngineDraft();
    return true;
  }
  if (settings.translateDraft) {
    settings.closeTranslateDraft();
  }

  if (settings.recording) {
    void settings.stopRecording();
    ui.searchText = "settings ";
    ui.focusField = "search";
    return true;
  }
  if (parseSettingsScreen(ui.commandRest) === "list") return false;
  settings.cancelReturn();
  ui.searchText = "settings ";
  ui.focusField = "search";
  return true;
}

export async function handleSettingsEnter(): Promise<void> {
  if (settings.engineDraft) {
    await settings.saveEngineDraft();
    return;
  }
  if (settings.translateDraft) {
    return;
  }

  const screen = parseSettingsScreen(ui.commandRest);
  if (screen === "engine") {
    const engine = settings.engines[settings.selectedIndex];
    if (engine) await settings.setEngine(engine.id);
    return;
  }
  if (screen === "theme") {
    const theme = settings.themes[settings.selectedIndex];
    if (theme) await settings.setTheme(theme.id);
    return;
  }
  if (screen === "hotkey") return;
  if (screen === "translate") return;
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
  if (item?.id === "engine") openEngineSettings();
  if (item?.id === "theme") openThemeSettings();
  if (item?.id === "hotkey") openHotkeySettings();
  if (item?.id === "language") openLanguageSettings();
  if (item?.id === "translate") openTranslateSettings();
  if (item?.id === "retention") openRetentionSettings();
  if (item?.id === "cleanup") {
    startClipCleanup();
    return;
  }
  if (item?.id === "export") {
    await settings.exportBackup();
    return;
  }
  if (item?.id === "import") {
    await settings.importBackup();
    return;
  }
}
