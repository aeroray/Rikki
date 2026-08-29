import { outputJson } from "$lib/commands/json/parse";
import { json } from "$lib/stores/json.svelte";
import { ui } from "$lib/stores/ui.svelte";

export function closeJsonEdit(): boolean {
  return json.stopEdit();
}

export async function handleJsonEnter(): Promise<boolean> {
  if (json.editing) return false;
  const output = outputJson(json.source, json.compact);
  if (!output) {
    json.startEdit();
    return false;
  }
  return copyJson(output);
}

export async function copyJson(value: string): Promise<boolean> {
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
