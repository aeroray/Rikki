import { copyAndHide } from "$lib/clipboard/write";
import { inspectTimestamp } from "./parse";
import { ui } from "$lib/stores/ui.svelte";

export async function copyTimestampValue(value: string): Promise<boolean> {
  return copyAndHide(value);
}

export async function copyTimestampResult(): Promise<boolean> {
  const inspected = inspectTimestamp(ui.commandRest);
  if (!inspected.ok) return false;
  return copyTimestampValue(inspected.copy);
}
