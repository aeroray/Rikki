import { invoke } from "@tauri-apps/api/core";
import jsQR from "jsqr";
import type { ClipboardEntry } from "$lib/commands/types";
import { imagePreviewSrc } from "$lib/commands/clip/preview";
import { clipboard } from "$lib/stores/clipboard.svelte";

const MAX_SIDE = 1600;

export type DecodeOutcome =
  | { ok: true; data: string }
  | { ok: false; reason: "empty" | "none" };

export async function decodeClipboardQr(): Promise<DecodeOutcome> {
  const images = clipboard.entries.filter((entry) => entry.type === "image").slice(0, 5);
  for (const entry of images) {
    const data = await decodeEntry(entry);
    if (data) return { ok: true, data };
  }

  const pasted = await decodeNavigatorClipboard();
  if (pasted) return { ok: true, data: pasted };
  if (images.length === 0) return { ok: false, reason: "empty" };
  return { ok: false, reason: "none" };
}

export async function decodeQrBlob(blob: Blob): Promise<DecodeOutcome> {
  try {
    const imageData = await pixelsFromBlob(blob);
    const data = decodePixels(imageData);
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

async function decodeNavigatorClipboard(): Promise<string | null> {
  if (!navigator.clipboard?.read) return null;
  try {
    const items = await navigator.clipboard.read();
    for (const item of items) {
      const type = item.types.find((name) => name.startsWith("image/"));
      if (!type) continue;
      const blob = await item.getType(type);
      const outcome = await decodeQrBlob(blob);
      if (outcome.ok) return outcome.data;
    }
  } catch {
    return null;
  }
  return null;
}

function decodePixels(imageData: ImageData): string | null {
  const code = jsQR(imageData.data, imageData.width, imageData.height, {
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
