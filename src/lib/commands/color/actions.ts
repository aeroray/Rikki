import { copyAndHide } from "$lib/clipboard/write";
import { ui } from "$lib/stores/ui.svelte";

export async function copyColorValue(value: string): Promise<boolean> {
  return copyAndHide(value);
}

export function applyRecentColor(hex: string): void {
  if (ui.matchedCommand?.id === "color") {
    ui.searchText = `color ${hex}`;
  } else {
    ui.searchText = hex;
  }
  ui.focusField = "search";
}
