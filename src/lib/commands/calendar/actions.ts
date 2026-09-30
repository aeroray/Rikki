import { copyAndHide } from "$lib/clipboard/write";
import { dateKey } from "$lib/commands/calendar/grid";
import { calendar } from "$lib/stores/calendar.svelte";

/** Enter on the calendar copies the highlighted date as YYYY-MM-DD. */
export async function copyCalendarDate(): Promise<boolean> {
  return copyAndHide(dateKey(calendar.selected));
}
