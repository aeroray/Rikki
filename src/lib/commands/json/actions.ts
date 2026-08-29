import { copyAndHide } from "$lib/clipboard/write";
import { outputJson } from "$lib/commands/json/parse";
import { json } from "$lib/stores/json.svelte";

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
  return copyAndHide(value);
}
