import { register } from "$lib/commands/registry";
import type { Command } from "$lib/commands/types";
import { translate } from "$lib/stores/translate.svelte";
import { ui } from "$lib/stores/ui.svelte";

export const translateCommand: Command = {
  id: "translate",
  prefix: "tr",
  aliases: ["translate", "翻译"],
  title: "Translate",
  titleZh: "翻译",
  description: "Translate text with Baidu",
  descriptionZh: "用百度翻译文本",
  icon: "Languages",
  run() {
    if (!ui.commandRest.trim()) {
      ui.searchText = "tr ";
      ui.focusField = "search";
      return;
    }
    void translate.copy();
  },
};

register(translateCommand);
