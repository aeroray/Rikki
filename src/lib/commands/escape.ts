import { closeAnniversaryDrill } from "$lib/commands/anniversary/actions";
import { closeEmojiDrill } from "$lib/commands/emoji/actions";
import { closeJsonEdit } from "$lib/commands/json/actions";
import { closeSettingsDrill } from "$lib/commands/settings/actions";
import { cancelSnippetDraft } from "$lib/commands/snippet/actions";
import { clipboard } from "$lib/stores/clipboard.svelte";
import { ui } from "$lib/stores/ui.svelte";

export function escapePalette(): void {
  // The destructive-action dialog sits above everything else, so it gets the
  // first refusal on Escape.
  if (ui.pendingConfirm) {
    ui.cancelConfirm();
    return;
  }
  if (ui.imagePreviewSrc) {
    ui.imagePreviewSrc = null;
    return;
  }
  if (clipboard.confirm) {
    clipboard.closeConfirm();
    return;
  }
  if (closeSettingsDrill()) return;
  if (closeAnniversaryDrill()) return;
  if (closeEmojiDrill()) return;
  if (closeJsonEdit()) return;
  if (cancelSnippetDraft()) return;
  if (ui.searchText.trim()) {
    ui.resetSearch();
    return;
  }
  ui.beginHide();
}
