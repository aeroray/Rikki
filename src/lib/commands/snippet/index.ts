import { register } from "$lib/commands/registry";
import { handleSnippetEnter } from "$lib/commands/snippet/actions";
import type { Command } from "$lib/commands/types";
import { snippets } from "$lib/stores/snippets.svelte";
import { ui } from "$lib/stores/ui.svelte";

export const snippetCommand: Command = {
  id: "snippet",
  prefix: "sn",
  aliases: ["snippet"],
  title: "片段 · Snippets",
  description: "搜索并复制文本片段",
  icon: "FileText",
  run(_input) {
    if (ui.view !== "snippet") {
      ui.searchText = "sn ";
      ui.focusField = "search";
      snippets.selectedIndex = 0;
      return;
    }
    void handleSnippetEnter();
  },
};

register(snippetCommand);
