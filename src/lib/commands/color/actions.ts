import { ui } from "$lib/stores/ui.svelte";
import { colorQuery, parseColor } from "./parse";

export async function copyColorValue(value: string): Promise<boolean> {
  const text = value.trim();
  if (!text) return false;
  try {
    await navigator.clipboard.writeText(text);
    ui.beginHide({ reset: true });
    return true;
  } catch {
    return false;
  }
}

export async function copyColorHex(): Promise<boolean> {
  const query = colorQuery(ui.searchText, ui.commandRest, ui.matchedCommand?.id ?? null);
  const parsed = parseColor(query);
  if (!parsed) return false;
  return copyColorValue(parsed.hex);
}

export function applyRecentColor(hex: string): void {
  if (ui.matchedCommand?.id === "color") {
    ui.searchText = `color ${hex}`;
  } else {
    ui.searchText = hex;
  }
  ui.focusField = "search";
}
