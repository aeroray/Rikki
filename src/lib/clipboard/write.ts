import { writeText } from "tauri-plugin-clipboard-x-api";
import { i18n } from "$lib/i18n";
import { clipboard } from "$lib/stores/clipboard.svelte";
import { ui } from "$lib/stores/ui.svelte";

export async function writeClipboardText(text: string): Promise<boolean> {
  // Only the emptiness check is trimmed: writing the trimmed value silently ate
  // the leading indentation and trailing newline of multi-line snippets.
  if (!text.trim()) return false;
  clipboard.suppressNextCapture();
  try {
    await writeText(text);
    return true;
  } catch {
    clipboard.suppressNextCapture(false);
    return false;
  }
}

export async function copyAndHide(text: string): Promise<boolean> {
  const ok = await writeClipboardText(text);
  if (!ok) {
    ui.flash(i18n.t("copy.failed"));
    return false;
  }
  ui.beginHide({ reset: true });
  return true;
}
