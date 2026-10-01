import type { ClipboardEntry } from "$lib/commands/types";
import { clipFilePaths } from "$lib/commands/clip/content";
import { parseColor } from "$lib/commands/color/parse";
import { clipboard } from "$lib/stores/clipboard.svelte";
import { ui, type ClipPreview } from "$lib/stores/ui.svelte";
import { convertFileSrc } from "@tauri-apps/api/core";

export function imagePreviewSrc(entry: ClipboardEntry): string | null {
  if (entry.type !== "image" || !entry.content) return null;
  try {
    return convertFileSrc(entry.content);
  } catch {
    return null;
  }
}

/**
 * What Tab shows for an entry, or `null` when there is nothing worth showing.
 *
 * A colour gets its own reading rather than the raw text: what the clipboard
 * holds is one notation, and the reason to look at it is the others. A copied
 * file list is shown as the paths, which the row cannot fit.
 */
export function previewFor(entry: ClipboardEntry): ClipPreview | null {
  if (entry.type === "image") {
    const src = imagePreviewSrc(entry);
    return src ? { kind: "image", src } : null;
  }
  if (entry.type === "files") {
    const paths = clipFilePaths(entry);
    return paths.length > 0 ? { kind: "text", body: paths.join("\n") } : null;
  }
  if (!entry.content.trim()) return null;
  return parseColor(entry.content)
    ? { kind: "color", content: entry.content }
    : { kind: "text", body: entry.content };
}

export function toggleSelectedPreview() {
  if (ui.preview) {
    ui.preview = null;
    return;
  }
  const list = clipboard.filtered(ui.commandRest);
  const entry = list[clipboard.selectedIndex];
  if (!entry) return;
  ui.preview = previewFor(entry);
}
