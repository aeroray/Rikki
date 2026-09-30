import { filterAnniversaries } from "$lib/commands/anniversary/filter";
import { parseDateQuery } from "$lib/commands/anniversary/dates";
import { anniversaries, type AnniversaryRow } from "$lib/stores/anniversaries.svelte";
import { ui } from "$lib/stores/ui.svelte";
import { parseAnniversaryScreen } from "./parse";

/**
 * The rows the panel shows for the current query.
 *
 * Shared with the keyboard handler so the list the arrow keys move through is
 * always the list on screen.
 */
export function anniversaryRows(rest = ui.commandRest, now = new Date()): AnniversaryRow[] {
  const rows = anniversaries.sorted(now);
  const screen = parseAnniversaryScreen(rest);
  if (screen.type !== "filter") return rows;
  const allowed = new Set(
    filterAnniversaries(
      rows.map((row) => row.item),
      screen.query,
    ).map((item) => item.id),
  );
  return rows.filter((row) => allowed.has(row.item.id));
}

/** Esc inside the panel steps out one level before clearing the query. */
export function closeAnniversaryDrill(): boolean {
  if (ui.view !== "anniversary") return false;
  if (anniversaries.draft) {
    anniversaries.closeDraft();
    return true;
  }
  if (ui.commandRest.trim()) {
    ui.searchText = "anniversary ";
    ui.focusField = "search";
    return true;
  }
  return false;
}

export function startAnniversaryCreate(): void {
  // Carry the typed date straight into the form so nothing is entered twice.
  const text = ui.commandRest.trim();
  const seed = parseDateQuery(text).kind === "date" ? text : "";
  anniversaries.openCreate(seed);
}

/** Enter on the list: edit the selected row, or create when the list is empty. */
export function handleAnniversaryEnter(rows: AnniversaryRow[] = anniversaryRows()): void {
  if (anniversaries.draft) {
    void anniversaries.saveDraft();
    return;
  }
  const screen = parseAnniversaryScreen(ui.commandRest);
  if (screen.type === "preview" || screen.type === "filter" || screen.type === "invalid") {
    startAnniversaryCreate();
    return;
  }
  const row = rows[anniversaries.selectedIndex];
  if (row) anniversaries.openEdit(row.item);
  else startAnniversaryCreate();
}
