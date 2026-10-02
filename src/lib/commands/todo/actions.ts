import { filterTagOf, isBrowsingTags } from "$lib/commands/todo/parse";
import { i18n } from "$lib/i18n";
import { todos } from "$lib/stores/todos.svelte";
import { ui } from "$lib/stores/ui.svelte";

/** One row of the label picker. */
export type PickerRow = { tag: string; label: string };

/**
 * Whether the label picker is on screen.
 *
 * It answers two different questions with one list, because they are the same
 * question from the user's side: which label. From the query — `todo #` or
 * `todo #购` — it means "show me to this label"; from `Ctrl+T` it means "put
 * this todo under this label". The rows differ by one entry and the key that
 * commits them, and nothing else.
 */
export function isPickingTags(): boolean {
  return todos.assigning !== null || isBrowsingTags(ui.commandRest, (tag) => todos.hasTag(tag));
}

/**
 * The rows the picker lists, in order.
 *
 * The first row is the way out of the label that is currently applied — 全部
 * when filtering, 无标签 when assigning — so the picker can always undo itself
 * without an Escape that would also close the panel.
 */
export function pickerRows(): PickerRow[] {
  const assigning = todos.assigning !== null;
  const query = assigning ? "" : filterTagOf(ui.commandRest);
  const head: PickerRow = assigning
    ? { tag: "", label: i18n.t("todo.tag.none") }
    : { tag: "", label: i18n.t("todo.filter.all") };
  return [head, ...todos.matchTags(query).map((tag) => ({ tag, label: `#${tag}` }))];
}

/** What Enter does to the highlighted row: commit a label, one way or the other. */
export function applyPickerRow(row: PickerRow | undefined): void {
  const id = todos.assigning;
  if (id !== null) {
    todos.setTag(id, row?.tag ?? "");
    todos.assigning = null;
    return;
  }
  ui.searchText = row?.tag ? `todo #${row.tag} ` : "todo ";
  ui.selectedIndex = 0;
}

/** Opens the picker over the highlighted todo, to move it to another label. */
export function startAssignTag(): void {
  const selected = todos.filtered(filterTagOf(ui.commandRest))[ui.selectedIndex];
  if (!selected) return;
  todos.assigning = selected.id;
  ui.selectedIndex = 0;
}

/** Closes the picker if it is open, and says whether it did. */
export function closePicker(): boolean {
  if (todos.assigning === null) return false;
  todos.assigning = null;
  return true;
}

/**
 * `Tab`: shows the highlighted todo in full, or closes the one already shown.
 *
 * The whole reason a row can be one line and still be read: a todo that wraps to
 * four lines makes every row a different height, and a list of different heights
 * is a list the eye cannot walk down.
 */
export function toggleTodoPreview(): void {
  if (ui.todoPreview) {
    ui.todoPreview = null;
    return;
  }
  // While the picker is up there is no highlighted todo to preview — the
  // highlight is on a label — and the index would otherwise pick whatever item
  // happens to sit at that position behind the list.
  if (isPickingTags()) return;
  const selected = todos.filtered(filterTagOf(ui.commandRest))[ui.selectedIndex];
  if (!selected) return;
  ui.todoPreview = selected;
}
