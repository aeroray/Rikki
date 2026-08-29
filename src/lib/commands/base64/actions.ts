import { copyAndHide } from "$lib/clipboard/write";
import { inspectBase64, toggleBase64Search } from "./parse";
import { ui } from "$lib/stores/ui.svelte";

export function toggleBase64Mode(): void {
  ui.searchText = toggleBase64Search(ui.searchText, ui.commandRest);
  ui.focusField = "search";
}

export async function copyBase64Result(): Promise<boolean> {
  const inspected = inspectBase64(ui.searchText, ui.commandRest);
  if (!inspected.ok) return false;
  return copyAndHide(inspected.output);
}
