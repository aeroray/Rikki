import { parseSnippetAction } from "$lib/commands/snippet/parse";
import { snippets } from "$lib/stores/snippets.svelte";
import { ui } from "$lib/stores/ui.svelte";

export function cancelSnippetDraft(): boolean {
  // Guard on the view like every other drill-closing handler does. Without it,
  // any panel whose rest happens to parse as `add` (e.g. `todo add milk`) gets
  // hijacked: Esc jumps to the snippet composer and drops the typed text.
  if (ui.view !== "snippet") return false;
  if (!snippets.draft && parseSnippetAction(ui.commandRest).type !== "add") {
    return false;
  }
  const action = parseSnippetAction(ui.commandRest);
  snippets.closeDraft();
  if (action.type === "add") {
    ui.searchText = "sn ";
  }
  ui.focusField = "search";
  return true;
}

export function startSnippetCreate(): void {
  ui.searchText = "sn add ";
  snippets.openCreate();
}

export function startSnippetEdit(): boolean {
  const list = snippets.filtered(ui.commandRest);
  snippets.clampSelection(list.length);
  const snippet = list[snippets.selectedIndex];
  if (!snippet) return false;
  snippets.openEdit(snippet);
  return true;
}

export async function handleSnippetEnter(): Promise<void> {
  if (snippets.draft) {
    await snippets.saveDraft();
    return;
  }

  if (parseSnippetAction(ui.commandRest).type === "add") {
    snippets.openCreate();
    return;
  }

  const list = snippets.filtered(ui.commandRest);
  snippets.clampSelection(list.length);
  const snippet = list[snippets.selectedIndex];
  if (!snippet) return;
  await snippets.copy(snippet.id);
}
