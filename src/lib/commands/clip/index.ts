import { register } from "$lib/commands/registry";
import type { Command } from "$lib/commands/types";
import { clipboard } from "$lib/stores/clipboard.svelte";
import { ui } from "$lib/stores/ui.svelte";

export const clipCommand: Command = {
  id: "clip",
  prefix: "clip",
  title: "Clipboard",
  description: "剪贴板历史",
  icon: "Clipboard",
  run(input) {
    if (!input.trim()) {
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
  if (ok) ui.beginHide();
}

register(clipCommand);
