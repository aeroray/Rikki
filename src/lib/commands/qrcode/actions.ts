import { invoke } from "@tauri-apps/api/core";
import { generateQrPngBytes, generateQrSvg } from "./generate";
import { decodeClipboardQr, decodeQrBlob, type DecodeOutcome } from "./decode";
import { ui } from "$lib/stores/ui.svelte";
import { qrdecode } from "$lib/stores/qrdecode.svelte";

export async function copyQrSvg(): Promise<boolean> {
  const text = ui.commandRest.trim();
  if (!text) return false;
  try {
    const svg = await generateQrSvg(text);
    await navigator.clipboard.writeText(svg);
    ui.beginHide({ reset: true });
    return true;
  } catch {
    return false;
  }
}

export async function saveQrPng(): Promise<boolean> {
  const text = ui.commandRest.trim();
  if (!text) return false;
  try {
    const bytes = await generateQrPngBytes(text);
    const saved = await invoke<boolean>("save_png_file", {
      bytes: Array.from(bytes),
      defaultName: "qr.png",
    });
    if (saved) ui.beginHide({ reset: true });
    return saved;
  } catch {
    return false;
  }
}

export async function copyQrDecode(): Promise<boolean> {
  const text = qrdecode.data.trim();
  if (!text) return false;
  try {
    await navigator.clipboard.writeText(text);
    ui.beginHide({ reset: true });
    return true;
  } catch {
    return false;
  }
}

export async function scanQrDecode(): Promise<void> {
  await applyDecode(decodeClipboardQr());
}

export async function scanQrFromBlob(blob: Blob): Promise<void> {
  await applyDecode(decodeQrBlob(blob));
}

async function applyDecode(task: Promise<DecodeOutcome>): Promise<void> {
  qrdecode.loading = true;
  qrdecode.data = "";
  qrdecode.reason = null;
  const outcome = await task;
  qrdecode.loading = false;
  if (outcome.ok) {
    qrdecode.data = outcome.data;
    qrdecode.reason = null;
    return;
  }
  qrdecode.reason = outcome.reason;
}
