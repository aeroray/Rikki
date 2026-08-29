import { register } from "$lib/commands/registry";
import type { Command } from "$lib/commands/types";
import { clipboard } from "$lib/stores/clipboard.svelte";
import { ui } from "$lib/stores/ui.svelte";

export const clipCommand: Command = {
  id: "clip",
  prefix: "clip",
  title: "Clipboard",
  titleZh: "剪贴板",
  description: "Text and image history",
  descriptionZh: "文本与图片历史",
  icon: "Clipboard",
  run(_input) {
    if (ui.view !== "clip") {
      ui.searchText = "clip ";
      ui.focusField = "search";
      clipboard.selectedIndex = 0;
      return;
    }
    void pasteSelected();
  },
};

async function pasteSelected() {
  const list = clipboard.filtered(ui.commandRest);
  clipboard.clampSelection(list.length);
  const entry = list[clipboard.selectedIndex];
  if (!entry) return;
  const ok = await clipboard.paste(entry.id);
  if (!ok) return;
}

register(clipCommand);
