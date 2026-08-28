import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import type { ClipboardEntry } from "$lib/commands/types";
import { fuzzyScore } from "$lib/fuzzy";
import {
  hasFiles,
  hasImage,
  hasText,
  readImage,
  readText,
  startListening,
  writeImage,
  writeText,
} from "tauri-plugin-clipboard-x-api";

const MAX_ENTRIES = 200;
const MAX_IMAGE_BYTES = 50 * 1024 * 1024;
const CLIPBOARD_CHANGED = "plugin:clipboard-x://clipboard_changed";

class ClipboardStore {
  entries = $state<ClipboardEntry[]>([]);
  selectedIndex = $state(0);
  private ready: Promise<void>;
  private writes: Promise<void> = Promise.resolve();
  private ignoreNext = false;
  private started = false;
  private imagesDir = "";

  constructor() {
    this.ready = this.hydrate();
  }

  filtered(query: string): ClipboardEntry[] {
    const q = query.trim().toLowerCase();
    const pinned = this.entries.filter((entry) => entry.pinned);
    const recent = this.entries.filter((entry) => !entry.pinned);
    const list = [...pinned, ...recent];
    if (!q) return list;
    return list.filter((entry) => matchesQuery(entry, q));
  }

  async start() {
    if (this.started) return;
    this.started = true;
    try {
      try {
        this.imagesDir = await invoke<string>("get_clipboard_images_dir");
      } catch {
        this.imagesDir = "";
      }
      await startListening();
      await listen(CLIPBOARD_CHANGED, () => {
        void this.handleChange();
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
      if (latest && latest.type === "text" && latest.content === value) return;
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
      if (entry.type === "image") {
        await writeImage(entry.content);
      } else {
        await writeText(entry.content);
      }
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

  private async handleChange() {
    if (this.ignoreNext) {
      this.ignoreNext = false;
      return;
    }
    try {
      if (await hasFiles()) return;
      const text = (await hasText()) ? (await readText()).trim() : "";
      const image = await hasImage();
      const urlLike = /^https?:\/\//i.test(text);
      if (image && (!text || urlLike) && this.imagesDir) {
        await this.captureImage();
        return;
      }
      if (text) this.capture(text);
    } catch {
      // Browser preview and unsupported clipboard payloads are ignored.
    }
  }

  private async captureImage() {
    if (!this.imagesDir) return;
    const image = await readImage(this.imagesDir);
    const path = typeof image.path === "string" ? image.path : String(image.path ?? "");
    if (!path) return;
    const size = Number(image.size) || 0;
    if (size > MAX_IMAGE_BYTES) {
      await invoke("discard_clipboard_image", { path }).catch(() => {});
      return;
    }
    await this.ready;
    const existing = this.entries.find(
      (entry) => entry.type === "image" && sameImage(entry.content, path),
    );
    if (existing && this.entries[0]?.id === existing.id) return;
    const next: ClipboardEntry = existing
      ? { ...existing, createdAt: Date.now(), width: image.width, height: image.height, size }
      : {
          id: `clip_${Date.now()}`,
          type: "image",
          content: path,
          appName: "",
          createdAt: Date.now(),
          pinned: false,
          width: image.width,
          height: image.height,
          size,
        };
    this.entries = prune([next, ...this.entries.filter((entry) => entry.id !== next.id)]);
    this.enqueueWrite();
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

function matchesQuery(entry: ClipboardEntry, query: string): boolean {
  if (entry.type === "image") {
    const dims =
      entry.width && entry.height ? `${entry.width}x${entry.height}` : "";
    return fuzzyScore(query, `图片 image png ${dims}`) > 0;
  }
  return fuzzyScore(query, entry.content) > 0;
}

function sameImage(left: string, right: string): boolean {
  const name = (path: string) => path.replace(/\\/g, "/").split("/").pop() ?? path;
  return name(left) === name(right);
}

function prune(entries: ClipboardEntry[]): ClipboardEntry[] {
  if (entries.length <= MAX_ENTRIES) return entries;
  const pinned = entries.filter((entry) => entry.pinned);
  const rest = entries.filter((entry) => !entry.pinned);
  const keep = Math.max(0, MAX_ENTRIES - pinned.length);
  return [...pinned, ...rest.slice(0, keep)].sort((a, b) => b.createdAt - a.createdAt);
}

export const clipboard = new ClipboardStore();
