import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { isColorValue } from "$lib/commands/color/parse";
import { applyExpire, parseClipRetentionDays, previewExpire } from "$lib/commands/clip/cleanup";
import { clipFilePaths, matchesClipQuery } from "$lib/commands/clip/content";
import type { ClipboardEntry } from "$lib/commands/types";
import { i18n } from "$lib/i18n";
import { ui } from "$lib/stores/ui.svelte";
import {
  hasFiles,
  hasImage,
  hasText,
  readFiles,
  readImage,
  readText,
  startListening,
  writeFiles,
  writeImage,
  writeText,
} from "tauri-plugin-clipboard-x-api";

const MAX_IMAGES = 200;
const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
/**
 * The largest body the history keeps, text and file lists alike.
 *
 * Text has no *count* cap, and the whole index is rewritten on every clipboard
 * change, so one "select all" in a large file would make every later copy
 * rewrite a multi-megabyte `index.json`. Half a million characters is far past
 * anything anyone pastes back, and small enough that the rewrite stays
 * invisible.
 */
const MAX_TEXT_CHARS = 512 * 1024;
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
  private pendingCapture: Promise<void> = Promise.resolve();

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
    return list.filter((entry) => matchesClipQuery(entry, q));
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
        // Held rather than dropped so a decode can wait for a capture of the
        // same image; never rejected, so awaiting it is safe.
        this.pendingCapture = this.handleChange().catch(() => {});
      });
    } catch {
      this.started = false;
    }
  }

  /**
   * Records a text copy.
   *
   * Only the emptiness check is trimmed, for the reason `writeClipboardText`
   * records on the way out: the body is stored exactly as it was copied, so
   * pasting it back keeps the leading indentation and the trailing newline of a
   * multi-line snippet. Trimming here undid that on the way in.
   */
  capture(content: string, appName = "") {
    if (!content.trim()) return;
    if (content.length > MAX_TEXT_CHARS) return;
    if (this.ignoreNext) {
      this.suppressNextCapture(false);
      return;
    }
    void this.ready.then(() => {
      this.upsert({
        id: clipId(),
        type: "text",
        content,
        appName,
        createdAt: Date.now(),
        pinned: false,
        isColor: isColorValue(content),
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
        ui.flash(
          saved ? i18n.t("clip.cleanupDone") : i18n.t("clip.saveFailed"),
          saved ? "success" : "info",
        );
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
      ui.flash(
        saved ? i18n.t("clip.clearDone") : i18n.t("clip.saveFailed"),
        saved ? "success" : "info",
      );
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
      } else if (entry.type === "files") {
        await writeFiles(clipFilePaths(entry));
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

  /**
   * The image on the clipboard right now, as bytes, without recording it.
   *
   * Decoding is a read, not a copy, so this must not reach `capture()` and add a
   * history row. The plugin names the file after a hash of the image bytes, so a
   * decode and a capture of the same image share one path: the file is discarded
   * only once no entry references it, or the clip row would point at a deleted
   * image.
   */
  async readCurrentImage(): Promise<Uint8Array | null> {
    if (!this.imagesDir) return null;
    // The reference check below reads `entries`, so wait for the hydration, and
    // for a capture of this same image that may be between writing the file and
    // recording the entry that keeps it referenced.
    await this.ready;
    await this.pendingCapture;
    let path = "";
    try {
      const image = await readImage(this.imagesDir);
      path = typeof image.path === "string" ? image.path : String(image.path ?? "");
    } catch {
      // No image on the clipboard is the ordinary case, not a failure.
      return null;
    }
    if (!path) return null;
    try {
      const raw = await invoke<number[] | Uint8Array>("read_clipboard_image", { path });
      return raw instanceof Uint8Array ? raw : Uint8Array.from(raw);
    } catch {
      return null;
    } finally {
      const referenced = this.entries.some(
        (entry) => entry.type === "image" && sameImage(entry.content, path),
      );
      if (!referenced) await invoke("discard_clipboard_image", { path }).catch(() => {});
    }
  }

  private async handleChange() {
    if (this.ignoreNext) {
      this.suppressNextCapture(false);
      return;
    }
    try {
      const appName = await invoke<string>("get_foreground_app").catch(() => "");
      // Files are read first because Explorer also puts the paths on the
      // clipboard as text: recording that instead would turn one copied folder
      // into a wall of paths, and pasting it back would paste the paths rather
      // than the files.
      if (await hasFiles()) {
        await this.captureFiles(appName);
        return;
      }
      const text = (await hasText()) ? await readText() : "";
      const trimmed = text.trim();
      const image = await hasImage();
      const urlLike = /^https?:\/\//i.test(trimmed);
      if (image && (!trimmed || urlLike) && this.imagesDir) {
        await this.captureImage(appName);
        return;
      }
      // The untrimmed body is what gets stored; `trimmed` only answers the two
      // questions above.
      if (text) this.capture(text, appName);
    } catch {
      // Browser preview and unsupported clipboard payloads are ignored.
    }
  }

  /**
   * Records a copied file list.
   *
   * The paths are stored joined by a newline in `content`, the same field a text
   * clip uses, so the whole history stays one list of one shape. A path with a
   * line break in it cannot be pasted back correctly, which is the one thing
   * this format gives up.
   */
  private async captureFiles(appName: string) {
    const files = await readFiles();
    if (!Array.isArray(files?.paths)) return;
    const paths = files.paths.filter((path) => path.trim().length > 0);
    if (paths.length === 0) return;
    const content = paths.join("\n");
    if (content.length > MAX_TEXT_CHARS) return;
    await this.ready;
    this.upsert({
      id: clipId(),
      type: "files",
      content,
      appName,
      createdAt: Date.now(),
      pinned: false,
      size: Number(files.size) || 0,
    });
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
