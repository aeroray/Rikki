import { invoke } from "@tauri-apps/api/core";
import type jsQRType from "jsqr";
import type { ClipboardEntry } from "$lib/commands/types";
import { imagePreviewSrc } from "$lib/commands/clip/preview";
import { clipboard } from "$lib/stores/clipboard.svelte";

const MAX_SIDE = 1600;

let jsQR: typeof jsQRType | null = null;

async function loadJsQr(): Promise<typeof jsQRType> {
  if (!jsQR) {
    const mod = await import("jsqr");
    jsQR = mod.default;
  }
  return jsQR;
}

export type DecodeOutcome =
  | { ok: true; data: string }
  | { ok: false; reason: "empty" | "none" };

export async function decodeClipboardQr(): Promise<DecodeOutcome> {
  const images = clipboard.entries.filter((entry) => entry.type === "image").slice(0, 5);
  for (const entry of images) {
    const data = await decodeEntry(entry);
    if (data) return { ok: true, data };
  }

  const current = await decodeCurrentImage();
  if (current) return { ok: true, data: current };
  if (images.length === 0) return { ok: false, reason: "empty" };
  return { ok: false, reason: "none" };
}

export async function decodeQrBlob(blob: Blob): Promise<DecodeOutcome> {
  try {
    const imageData = await pixelsFromBlob(blob);
    const data = await decodePixels(imageData);
    if (data) return { ok: true, data };
    return { ok: false, reason: "none" };
  } catch {
    return { ok: false, reason: "none" };
  }
}

async function decodeEntry(entry: ClipboardEntry): Promise<string | null> {
  try {
    const raw = await invoke<number[] | Uint8Array>("read_clipboard_image", { path: entry.content });
    const bytes = raw instanceof Uint8Array ? raw : Uint8Array.from(raw);
    const imageData = await pixelsFromBlob(new Blob([bytes]));
    return decodePixels(imageData);
  } catch {
    // Fall back to the asset URL if the file command is unavailable.
  }

  const src = imagePreviewSrc(entry);
  if (!src) return null;
  try {
    const imageData = await pixelsFromUrl(src);
    return decodePixels(imageData);
  } catch {
    return null;
  }
}

/**
 * The image copied most recently may not be in the history yet — the capture is
 * asynchronous — so the clipboard itself is read once more. It goes through the
 * Rust plugin rather than `navigator.clipboard`, which asks the user for
 * permission before handing an image to the webview.
 */
async function decodeCurrentImage(): Promise<string | null> {
  const bytes = await clipboard.readCurrentImage();
  if (!bytes) return null;
  const outcome = await decodeQrBlob(new Blob([bytes]));
  return outcome.ok ? outcome.data : null;
}

async function decodePixels(imageData: ImageData): Promise<string | null> {
  const decode = await loadJsQr();
  const code = decode(imageData.data, imageData.width, imageData.height, {
    inversionAttempts: "attemptBoth",
  });
  const data = code?.data.trim() ?? "";
  return data || null;
}

async function pixelsFromUrl(src: string): Promise<ImageData> {
  if (src.startsWith("blob:")) return loadImageData(src);
  try {
    const res = await fetch(src);
    if (!res.ok) throw new Error("fetch");
    return pixelsFromBlob(await res.blob());
  } catch {
    return loadImageData(src);
  }
}

function pixelsFromBlob(blob: Blob): Promise<ImageData> {
  const url = URL.createObjectURL(blob);
  return loadImageData(url).finally(() => URL.revokeObjectURL(url));
}

function loadImageData(src: string): Promise<ImageData> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      try {
        const width = img.naturalWidth || img.width;
        const height = img.naturalHeight || img.height;
        if (!width || !height) throw new Error("empty");
        const scale = Math.min(1, MAX_SIDE / Math.max(width, height));
        const canvas = document.createElement("canvas");
        canvas.width = Math.max(1, Math.round(width * scale));
        canvas.height = Math.max(1, Math.round(height * scale));
        const ctx = canvas.getContext("2d", { willReadFrequently: true });
        if (!ctx) throw new Error("canvas");
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        resolve(ctx.getImageData(0, 0, canvas.width, canvas.height));
      } catch (err) {
        reject(err);
      }
    };
    img.onerror = () => reject(new Error("image"));
    img.src = src;
  });
}
