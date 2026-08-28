import type { ClipboardEntry } from "$lib/commands/types";
import { clipboard } from "$lib/stores/clipboard.svelte";
import { ui } from "$lib/stores/ui.svelte";
import { convertFileSrc } from "@tauri-apps/api/core";

export function imagePreviewSrc(entry: ClipboardEntry): string | null {
  if (entry.type !== "image" || !entry.content) return null;
  try {
    return convertFileSrc(entry.content);
  } catch {
    return null;
  }
}

export function toggleSelectedImagePreview() {
  if (ui.imagePreviewSrc) {
    ui.imagePreviewSrc = null;
    return;
  }
  const list = clipboard.filtered(ui.commandRest);
  const entry = list[clipboard.selectedIndex];
  if (!entry) return;
  ui.imagePreviewSrc = imagePreviewSrc(entry);
}
