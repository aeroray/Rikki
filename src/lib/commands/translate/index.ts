import { register } from "$lib/commands/registry";
import type { Command } from "$lib/commands/types";
import { translate } from "$lib/stores/translate.svelte";
import { ui } from "$lib/stores/ui.svelte";

export const translateCommand: Command = {
  id: "translate",
  prefix: "tr",
  title: "Translate",
  titleZh: "翻译",
  description: "Translate text into another language",
  descriptionZh: "把文本翻译成其他语言",
  icon: "Languages",
  run() {
    if (!ui.commandRest.trim()) {
      ui.searchText = "tr ";
      ui.focusField = "search";
      return;
    }
    void translate.submit();
  },
};

register(translateCommand);
