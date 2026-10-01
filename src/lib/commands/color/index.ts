import { register } from "$lib/commands/registry";
import type { Command } from "$lib/commands/types";
import { ui } from "$lib/stores/ui.svelte";
import { parseColor } from "./parse";
import { runColorOption } from "./selection";

export const colorCommand: Command = {
  id: "color",
  prefix: "color",
  title: "Color",
  titleZh: "颜色",
  description: "Preview and convert colors",
  descriptionZh: "预览颜色并转换格式",
  icon: "Droplet",
  run(input) {
    const text = input.trim();
    if (ui.view !== "color") {
      ui.searchText = text ? `color ${text}` : "color ";
      ui.focusField = "search";
      return;
    }
    if (!parseColor(text) && !parseColor(ui.searchText.trim())) return;
    // The highlighted row, not always HEX: the arrows move through the formats
    // and then the recent strip, so Enter has to follow them.
    runColorOption(ui.selectedIndex);
  },
};

register(colorCommand);
