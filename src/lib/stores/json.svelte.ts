import { inspectJson } from "$lib/commands/json/parse";
import { clipboard } from "$lib/stores/clipboard.svelte";
import { ui } from "$lib/stores/ui.svelte";
import { hasText, readText } from "tauri-plugin-clipboard-x-api";

class JsonStore {
  source = $state("");
  compact = $state(false);
  editing = $state(false);
  private seeded = false;
  private pendingDraft: string | null = null;
  private draftTimer: ReturnType<typeof setTimeout> | null = null;

  readonly inspected = $derived(inspectJson(this.source));

  /**
   * Records what the editor holds, without parsing it yet.
   *
   * `inspected` re-parses and re-formats the whole document, measured at ~26ms
   * for a 1.6MB file, so running it on every keystroke stutters. The textarea
   * keeps its own value in the meantime — it is bound one-way to `source`, so
   * leaving `source` alone leaves the typed text where the user put it.
   */
  setDraft(text: string) {
    this.pendingDraft = text;
    if (this.draftTimer) clearTimeout(this.draftTimer);
    this.draftTimer = setTimeout(() => this.flushDraft(), 120);
  }

  /** Applies whatever the editor last held, e.g. before leaving the editor. */
  flushDraft() {
    if (this.draftTimer) {
      clearTimeout(this.draftTimer);
      this.draftTimer = null;
    }
    if (this.pendingDraft === null) return;
    this.source = this.pendingDraft;
    this.pendingDraft = null;
  }

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
    if (!this.source) void this.seedFromLiveClipboard();
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
    // Without this the last keystrokes are still sitting in the debounce and
    // would be dropped on the way out.
    this.flushDraft();
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
    if (this.draftTimer) {
      clearTimeout(this.draftTimer);
      this.draftTimer = null;
    }
    this.pendingDraft = null;
    this.source = "";
    this.compact = false;
    this.editing = false;
    this.seeded = false;
  }

  private async seedFromLiveClipboard() {
    if (this.editing || this.source || ui.commandRest.trim()) return;
    try {
      if (!(await hasText())) return;
      const text = (await readText()).trim();
      if (!text || this.editing || this.source || ui.commandRest.trim()) return;
      this.source = text;
    } catch {
      // Browser preview and empty live clipboard are ignored.
    }
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
