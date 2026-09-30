import { register } from "$lib/commands/registry";
import type { Command } from "$lib/commands/types";
import { ui } from "$lib/stores/ui.svelte";
import { handleJsonEnter } from "./actions";

export const jsonCommand: Command = {
  id: "json",
  prefix: "json",
  title: "JSON",
  titleZh: "格式化",
  description: "Format, minify, and validate JSON",
  descriptionZh: "格式化、压缩并校验 JSON",
  icon: "Braces",
  run(input) {
    if (ui.view !== "json") {
      ui.searchText = input.trim() ? `json ${input.trim()}` : "json ";
      ui.focusField = "search";
      return;
    }
    void handleJsonEnter();
  },
};

register(jsonCommand);
