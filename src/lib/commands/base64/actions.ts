import { inspectBase64, toggleBase64Search } from "./parse";
import { ui } from "$lib/stores/ui.svelte";

export function toggleBase64Mode(): void {
  ui.searchText = toggleBase64Search(ui.searchText, ui.commandRest);
  ui.focusField = "search";
}

export async function copyBase64Result(): Promise<boolean> {
  const inspected = inspectBase64(ui.searchText, ui.commandRest);
  if (!inspected.ok) return false;
  try {
    await navigator.clipboard.writeText(inspected.output);
    ui.beginHide({ reset: true });
    return true;
  } catch {
    return false;
  }
}
