import { parseSettingsScreen } from "$lib/commands/settings/parse";
import { settings } from "$lib/stores/settings.svelte";
import { ui } from "$lib/stores/ui.svelte";

export function openEngineSettings(): void {
  ui.searchText = "settings 搜索引擎";
  ui.focusField = "search";
}

export function openThemeSettings(): void {
  ui.searchText = "settings 主题";
  ui.focusField = "search";
}

export function openHotkeySettings(): void {
  ui.searchText = "settings 快捷键";
  ui.focusField = "search";
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

  const item = settings.listItems[settings.selectedIndex];
  if (item?.id === "engine") openEngineSettings();
  if (item?.id === "theme") openThemeSettings();
  if (item?.id === "hotkey") openHotkeySettings();
}
