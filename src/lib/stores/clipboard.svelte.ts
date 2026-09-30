import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { isColorValue } from "$lib/commands/color/parse";
import { applyExpire, parseClipRetentionDays, previewExpire } from "$lib/commands/clip/cleanup";
import type { ClipboardEntry } from "$lib/commands/types";
import { fuzzyScore } from "$lib/fuzzy";
import { i18n } from "$lib/i18n";
import { ui } from "$lib/stores/ui.svelte";
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

const MAX_IMAGES = 200;
const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
const CLIPBOARD_CHANGED = "plugin:clipboard-x://clipboard_changed";
/** How long changes are collected before the index is rewritten. */
const WRITE_DEBOUNCE_MS = 150;

class ClipboardStore {
  entries = $state<ClipboardEntry[]>([]);
  selectedIndex = $state(0);
  confirm = $state<ClipConfirm | null>(null);
  private ready: Promise<void>;
  private writes: Promise<boolean> = Promise.resolve(true);
  private dirty = false;
  private writeTimer: ReturnType<typeof setTimeout> | null = null;
  private writeWaiters: Array<(ok: boolean) => void> = [];
  private ignoreNext = false;
  private ignoreTimer: ReturnType<typeof setTimeout> | null = null;
  private started = false;
  private imagesDir = "";

  constructor() {
    this.ready = this.hydrate();
    ui.onHideFlush(() => this.closeConfirm());
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

  capture(content: string, appName = "") {
    const value = content.trim();
    if (!value) return;
    if (this.ignoreNext) {
      this.suppressNextCapture(false);
      return;
    }
    void this.ready.then(() => {
      this.upsert({
        id: clipId(),
        type: "text",
        content: value,
        appName,
        createdAt: Date.now(),
        pinned: false,
        isColor: isColorValue(value),
      });
    });
  }

  togglePin(id: string) {
    void this.ready.then(() => {
      this.entries = this.entries.map((entry) =>
        entry.id === id ? { ...entry, pinned: !entry.pinned } : entry,
      );
      // Pinning moves the row into the pinned block, which shifts every index
      // after it. Re-point the selection by id, against the same list the panel
      // renders, or the next Enter pastes whichever entry inherited the index.
      const index = this.filtered(ui.commandRest).findIndex((entry) => entry.id === id);
      if (index >= 0) this.selectedIndex = index;
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

  async clear(keepPinned = true): Promise<boolean> {
    await this.ready;
    this.entries = keepPinned ? this.entries.filter((entry) => entry.pinned) : [];
    this.selectedIndex = 0;
    this.closeConfirm();
    return this.enqueueWrite();
  }

  closeConfirm() {
    this.confirm = null;
  }

  openExpireConfirm(days: number) {
    const retention = parseClipRetentionDays(days);
    if (retention <= 0) return;
    const preview = previewExpire(this.entries, retention, Date.now());
    if (preview.texts === 0 && preview.images === 0) {
      ui.flash(i18n.t("clip.cleanupNone"));
      return;
    }
    this.confirm = { kind: "expire", days: retention, ...preview };
  }

  openClearConfirm() {
    const count = this.entries.filter((entry) => !entry.pinned).length;
    if (count === 0) return;
    this.confirm = { kind: "clear", count };
  }

  confirmAction() {
    const confirm = this.confirm;
    if (!confirm) return;
    if (confirm.kind === "expire") {
      if (confirm.texts === 0 && confirm.images === 0) {
        this.closeConfirm();
        ui.flash(i18n.t("clip.cleanupNone"));
        return;
      }
      void this.ready.then(async () => {
        this.entries = applyExpire(this.entries, confirm.days, Date.now());
        this.selectedIndex = 0;
        this.closeConfirm();
        const saved = await this.enqueueWrite();
        ui.flash(saved ? i18n.t("clip.cleanupDone") : i18n.t("clip.saveFailed"));
      });
      return;
    }
    if (confirm.count === 0) {
      this.closeConfirm();
      return;
    }
    // Report success only after the write lands, instead of claiming the
    // history was cleared while the file on disk is unchanged.
    void this.clear(true).then((saved) => {
      ui.flash(saved ? i18n.t("clip.clearDone") : i18n.t("clip.saveFailed"));
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

  suppressNextCapture(enabled = true) {
    this.ignoreNext = enabled;
    if (this.ignoreTimer) {
      clearTimeout(this.ignoreTimer);
      this.ignoreTimer = null;
    }
    if (enabled) {
      this.ignoreTimer = setTimeout(() => {
        this.ignoreNext = false;
        this.ignoreTimer = null;
      }, 1500);
    }
  }

  async paste(id?: string) {
    const entry = id
      ? this.entries.find((item) => item.id === id)
      : this.filtered("")[this.selectedIndex];
    if (!entry) return false;
    this.suppressNextCapture();
    try {
      if (entry.type === "image") {
        await writeImage(entry.content);
      } else {
        await writeText(entry.content);
      }
      ui.beginHide({ reset: true });
      void invoke("simulate_paste").catch(() => {});
      return true;
    } catch {
      this.suppressNextCapture(false);
      ui.flash(i18n.t("clip.pasteFailed"));
      return false;
    }
  }

  private async handleChange() {
    if (this.ignoreNext) {
      this.suppressNextCapture(false);
      return;
    }
    try {
      const appName = await invoke<string>("get_foreground_app").catch(() => "");
      if (await hasFiles()) return;
      const text = (await hasText()) ? (await readText()).trim() : "";
      const image = await hasImage();
      const urlLike = /^https?:\/\//i.test(text);
      if (image && (!text || urlLike) && this.imagesDir) {
        await this.captureImage(appName);
        return;
      }
      if (text) this.capture(text, appName);
    } catch {
      // Browser preview and unsupported clipboard payloads are ignored.
    }
  }

  private async captureImage(appName: string) {
    if (!this.imagesDir) return;
    // The plugin writes the PNG here, and the entry that references it is only
    // recorded afterwards. A queued save running in that window would sweep the
    // file away as an orphan, leaving a row that can never be pasted. Draining
    // the queue first closes it.
    await this.writes;
    const image = await readImage(this.imagesDir);
    const path = typeof image.path === "string" ? image.path : String(image.path ?? "");
    if (!path) return;
    const size = Number(image.size) || 0;
    if (size > MAX_IMAGE_BYTES) {
      const referenced = this.entries.some(
        (entry) => entry.type === "image" && sameImage(entry.content, path),
      );
      if (!referenced) await invoke("discard_clipboard_image", { path }).catch(() => {});
      return;
    }
    await this.ready;
    this.upsert({
      id: clipId(),
      type: "image",
      content: path,
      appName,
      createdAt: Date.now(),
      pinned: false,
      width: image.width,
      height: image.height,
      size,
    });
  }

  private upsert(incoming: ClipboardEntry) {
    const duplicates = this.entries.filter((entry) => sameClip(entry, incoming));
    const pinned = duplicates.some((entry) => entry.pinned);
    const kept = duplicates[0];
    const next: ClipboardEntry = {
      ...incoming,
      id: kept?.id ?? incoming.id,
      pinned,
      appName: incoming.appName || kept?.appName || "",
    };
    this.entries = prune([
      next,
      ...this.entries.filter((entry) => !sameClip(entry, incoming)),
    ]);
    this.enqueueWrite();
  }

  private async hydrate() {
    try {
      const loaded = await invoke<ClipboardEntry[]>("get_clipboard_history");
      this.entries = prune(loaded);
      if (this.entries.length !== loaded.length) this.enqueueWrite();
    } catch {
      this.entries = [];
    }
  }

  /**
   * Marks the index dirty and returns a promise for the next flush.
   *
   * Changes are collected rather than written one-for-one: copying several
   * things in a row used to rewrite the whole index once per item. The short
   * delay also gives a just-written image time to be recorded before the orphan
   * sweep looks at the directory.
   */
  private enqueueWrite(): Promise<boolean> {
    this.dirty = true;
    const settled = new Promise<boolean>((resolve) => this.writeWaiters.push(resolve));
    if (this.writeTimer) clearTimeout(this.writeTimer);
    this.writeTimer = setTimeout(() => void this.flushWrites(), WRITE_DEBOUNCE_MS);
    this.writes = settled;
    return settled;
  }

  private async flushWrites(): Promise<void> {
    if (this.writeTimer) {
      clearTimeout(this.writeTimer);
      this.writeTimer = null;
    }
    if (!this.dirty) return;
    this.dirty = false;
    const waiters = this.writeWaiters;
    this.writeWaiters = [];
    const ok = await this.write();
    for (const resolve of waiters) resolve(ok);
  }

  private async write(): Promise<boolean> {
    try {
      await invoke("save_clipboard_history", { entries: this.entries });
      return true;
    } catch {
      // Browser preview has no Tauri runtime; a real IO failure is reported to
      // the caller so the UI stops claiming the change was saved.
      return false;
    }
  }
}

function matchesQuery(entry: ClipboardEntry, query: string): boolean {
  if (entry.type === "image") {
    const dims =
      entry.width && entry.height ? `${entry.width}x${entry.height}` : "";
    return fuzzyScore(query, `图片 image png ${dims} ${entry.appName}`) > 0;
  }
  return fuzzyScore(query, entry.content) > 0 || fuzzyScore(query, entry.appName) > 0;
}

/** Two captures inside the same millisecond must not share a row id. */
function clipId(): string {
  return `clip_${crypto.randomUUID()}`;
}

function sameClip(left: ClipboardEntry, right: ClipboardEntry): boolean {
  if (left.type !== right.type) return false;
  if (left.type === "image") return sameImage(left.content, right.content);
  return left.content === right.content;
}

function sameImage(left: string, right: string): boolean {
  const name = (path: string) => path.replace(/\\/g, "/").split("/").pop() ?? path;
  return name(left) === name(right);
}

function prune(entries: ClipboardEntry[]): ClipboardEntry[] {
  const texts = entries.filter((entry) => entry.type !== "image");
  let images = entries.filter((entry) => entry.type === "image");
  if (images.length > MAX_IMAGES) {
    const pinned = images.filter((entry) => entry.pinned).sort((a, b) => b.createdAt - a.createdAt);
    const rest = images.filter((entry) => !entry.pinned).sort((a, b) => b.createdAt - a.createdAt);
    if (pinned.length > MAX_IMAGES) {
      images = pinned.slice(0, MAX_IMAGES);
    } else {
      images = [...pinned, ...rest.slice(0, MAX_IMAGES - pinned.length)];
    }
  }
  return [...texts, ...images].sort((a, b) => b.createdAt - a.createdAt);
}

export const clipboard = new ClipboardStore();

export type ClipConfirm =
  | { kind: "expire"; days: number; texts: number; images: number }
  | { kind: "clear"; count: number };
