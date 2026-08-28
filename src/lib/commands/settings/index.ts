import { register } from "$lib/commands/registry";
import { handleSettingsEnter } from "$lib/commands/settings/actions";
import type { Command } from "$lib/commands/types";
import { settings } from "$lib/stores/settings.svelte";
import { ui } from "$lib/stores/ui.svelte";

export const settingsCommand: Command = {
  id: "settings",
  prefix: "settings",
  aliases: ["设置", "配置", "preferences"],
  title: "设置 · Settings",
  description: "默认搜索引擎和其他选项",
  icon: "Settings",
  run() {
    if (ui.view !== "settings") {
      ui.searchText = "settings ";
      ui.focusField = "search";
      settings.selectedIndex = 0;
      return;
    }
    void handleSettingsEnter();
  },
};

register(settingsCommand);
