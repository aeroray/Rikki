import { inspectJson } from "$lib/commands/json/parse";
import { clipboard } from "$lib/stores/clipboard.svelte";
import { ui } from "$lib/stores/ui.svelte";

class JsonStore {
  source = $state("");
  compact = $state(false);
  editing = $state(false);
  private seeded = false;

  readonly inspected = $derived(inspectJson(this.source));

  hydrate(rest: string) {
    if (this.editing) return;
    if (rest.trim()) {
      this.source = rest;
      this.seeded = true;
      return;
    }
    if (this.seeded) return;
    this.source = latestClipText();
    this.seeded = true;
  }

  startEdit() {
    const rest = ui.commandRest;
    if (rest.trim()) this.source = rest;
    this.editing = true;
    ui.searchText = `${jsonPrefix(ui.searchText)} `;
    ui.focusField = "json-editor";
  }

  stopEdit() {
    if (!this.editing) return false;
    const inspected = inspectJson(this.source);
    if (inspected.ok) this.source = inspected.pretty;
    this.editing = false;
    ui.focusField = "search";
    return true;
  }

  toggleCompact() {
    if (this.editing) return;
    this.compact = !this.compact;
  }

  reset() {
    this.source = "";
    this.compact = false;
    this.editing = false;
    this.seeded = false;
  }
}

function jsonPrefix(searchText: string): string {
  const lower = searchText.trimStart().toLowerCase();
  return lower.startsWith("jsonf") ? "jsonf" : "json";
}

function latestClipText(): string {
  const entry = clipboard.entries.find((item) => item.type === "text");
  return entry?.content ?? "";
}

export const json = new JsonStore();
