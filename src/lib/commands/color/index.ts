import { register } from "$lib/commands/registry";
import type { Command } from "$lib/commands/types";
import { ui } from "$lib/stores/ui.svelte";
import { copyColorHex } from "./actions";
import { parseColor } from "./parse";

export const colorCommand: Command = {
  id: "color",
  prefix: "color",
  aliases: ["clr", "颜色"],
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
    void copyColorHex();
  },
};

register(colorCommand);
