import { closeAnniversaryDrill } from "$lib/commands/anniversary/actions";
import { closeEmojiDrill } from "$lib/commands/emoji/actions";
import { closeJsonEdit } from "$lib/commands/json/actions";
import { closeSettingsDrill } from "$lib/commands/settings/actions";
import { cancelSnippetDraft } from "$lib/commands/snippet/actions";
import { closePicker } from "$lib/commands/todo/actions";
import { clipboard } from "$lib/stores/clipboard.svelte";
import { ui } from "$lib/stores/ui.svelte";

export function escapePalette(): void {
  // The destructive-action dialog sits above everything else, so it gets the
  // first refusal on Escape.
  if (ui.pendingConfirm) {
    ui.cancelConfirm();
    return;
  }
  if (ui.todoPreview) {
    ui.todoPreview = null;
    return;
  }
  if (ui.preview) {
    ui.preview = null;
    return;
  }
  if (clipboard.confirm) {
    clipboard.closeConfirm();
    return;
  }
  // Before the settings drill: the label picker sits inside the todo panel the
  // same way a settings sub-screen sits inside its list, and Escape should undo
  // one step of it rather than leave the whole command.
  if (closePicker()) return;
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
