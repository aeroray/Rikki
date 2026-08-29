import { inspectTimestamp } from "./parse";
import { ui } from "$lib/stores/ui.svelte";

export async function copyTimestampValue(value: string): Promise<boolean> {
  const text = value.trim();
  if (!text) return false;
  try {
    await navigator.clipboard.writeText(text);
    ui.beginHide({ reset: true });
    return true;
  } catch {
    return false;
  }
}

export async function copyTimestampResult(): Promise<boolean> {
  const inspected = inspectTimestamp(ui.commandRest);
  if (!inspected.ok) return false;
  return copyTimestampValue(inspected.copy);
}
