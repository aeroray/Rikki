import { invoke } from "@tauri-apps/api/core";
import type { ClipboardEntry } from "$lib/commands/types";
import { fuzzyScore } from "$lib/fuzzy";
import {
  onClipboardChange,
  startListening,
  writeText,
} from "tauri-plugin-clipboard-x-api";

const MAX_ENTRIES = 200;

class ClipboardStore {
  entries = $state<ClipboardEntry[]>([]);
  selectedIndex = $state(0);
  private ready: Promise<void>;
  private writes: Promise<void> = Promise.resolve();
  private ignoreNext = false;
  private started = false;

  constructor() {
    this.ready = this.hydrate();
  }

  filtered(query: string): ClipboardEntry[] {
    const q = query.trim().toLowerCase();
    const pinned = this.entries.filter((entry) => entry.pinned);
    const recent = this.entries.filter((entry) => !entry.pinned);
    const list = [...pinned, ...recent];
    if (!q) return list;
    return list.filter((entry) => fuzzyScore(q, entry.content) > 0);
  }

  async start() {
    if (this.started) return;
    this.started = true;
    try {
      await startListening();
      await onClipboardChange((result) => {
        const text = result.text?.value?.trim() ?? "";
        if (!text) return;
        this.capture(text);
      });
    } catch {
      this.started = false;
    }
  }

  capture(content: string) {
    const value = content.trim();
    if (!value) return;
    if (this.ignoreNext) {
      this.ignoreNext = false;
      return;
    }
    void this.ready.then(() => {
      const latest = this.entries[0];
      if (latest && latest.content === value) return;
      const next: ClipboardEntry = {
        id: `clip_${Date.now()}`,
        type: "text",
        content: value,
        appName: "",
        createdAt: Date.now(),
        pinned: false,
      };
      this.entries = prune([next, ...this.entries]);
      this.enqueueWrite();
    });
  }

  togglePin(id: string) {
    void this.ready.then(() => {
      this.entries = this.entries.map((entry) =>
        entry.id === id ? { ...entry, pinned: !entry.pinned } : entry,
      );
      this.enqueueWrite();
    });
  }

  remove(id: string) {
    void this.ready.then(() => {
      this.entries = this.entries.filter((entry) => entry.id !== id);
      this.selectedIndex = Math.max(0, Math.min(this.selectedIndex, this.entries.length - 1));
      this.enqueueWrite();
    });
  }

  clear(keepPinned = true) {
    void this.ready.then(() => {
      this.entries = keepPinned ? this.entries.filter((entry) => entry.pinned) : [];
      this.selectedIndex = 0;
      this.enqueueWrite();
    });
  }

  clampSelection(count: number) {
    if (count <= 0) {
      this.selectedIndex = 0;
      return;
    }
    if (this.selectedIndex < 0) this.selectedIndex = 0;
    if (this.selectedIndex >= count) this.selectedIndex = count - 1;
  }

  async paste(id?: string) {
    const entry = id
      ? this.entries.find((item) => item.id === id)
      : this.filtered("")[this.selectedIndex];
    if (!entry) return false;
    this.ignoreNext = true;
    try {
      await writeText(entry.content);
      this.entries = prune([
        { ...entry, createdAt: Date.now() },
        ...this.entries.filter((item) => item.id !== entry.id),
      ]);
      this.enqueueWrite();
      return true;
    } catch {
      this.ignoreNext = false;
      return false;
    }
  }

  private async hydrate() {
    try {
      this.entries = await invoke<ClipboardEntry[]>("get_clipboard_history");
    } catch {
      this.entries = [];
    }
  }

  private enqueueWrite() {
    this.writes = this.writes
      .then(() => this.write())
      .catch(() => {});
  }

  private async write() {
    try {
      await invoke("save_clipboard_history", { entries: this.entries });
    } catch {
      // Browser preview has no Tauri runtime.
    }
  }
}

function prune(entries: ClipboardEntry[]): ClipboardEntry[] {
  if (entries.length <= MAX_ENTRIES) return entries;
  const pinned = entries.filter((entry) => entry.pinned);
  const rest = entries.filter((entry) => !entry.pinned);
  const keep = Math.max(0, MAX_ENTRIES - pinned.length);
  return [...pinned, ...rest.slice(0, keep)].sort((a, b) => b.createdAt - a.createdAt);
}

export const clipboard = new ClipboardStore();
