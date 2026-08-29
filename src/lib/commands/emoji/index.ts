import { register } from "$lib/commands/registry";
import { handleEmojiEnter } from "$lib/commands/emoji/actions";
import type { Command } from "$lib/commands/types";
import { emojis } from "$lib/stores/emojis.svelte";
import { ui } from "$lib/stores/ui.svelte";

export const emojiCommand: Command = {
  id: "emoji",
  prefix: "em",
  aliases: ["emoji", "表情"],
  title: "Emoji",
  titleZh: "表情",
  description: "Browse and copy emoji",
  descriptionZh: "浏览分类并复制表情",
  icon: "Smile",
  run() {
    if (ui.view !== "emoji") {
      ui.searchText = "em ";
      ui.focusField = "search";
      emojis.selectedIndex = 0;
      void emojis.ensure();
      return;
    }
    handleEmojiEnter();
  },
};

register(emojiCommand);
