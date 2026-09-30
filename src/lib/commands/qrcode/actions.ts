import { invoke } from "@tauri-apps/api/core";
import { copyAndHide } from "$lib/clipboard/write";
import { generateQrPngBytes, generateQrSvg } from "./generate";
import { decodeClipboardQr, decodeQrBlob, type DecodeOutcome } from "./decode";
import { i18n } from "$lib/i18n";
import { ui } from "$lib/stores/ui.svelte";
import { qrdecode } from "$lib/stores/qrdecode.svelte";

export async function copyQrSvg(): Promise<boolean> {
  const text = ui.commandRest.trim();
  if (!text) return false;
  try {
    const svg = await generateQrSvg(text);
    return copyAndHide(svg);
  } catch {
    ui.flash(i18n.t("qr.invalid"));
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
    ui.flash(i18n.t("qr.saveFailed"));
    return false;
  }
}

export async function copyQrDecode(): Promise<boolean> {
  // Scanning is async and can still be running, or can have failed, so Enter is
  // reachable with nothing to copy. Returning quietly matches the other copy
  // helpers; flashing "copy failed" would invite a pointless retry.
  if (!qrdecode.data) return false;
  return copyAndHide(qrdecode.data);
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
