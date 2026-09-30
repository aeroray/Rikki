import { register } from "$lib/commands/registry";
import type { Command } from "$lib/commands/types";
import { ui } from "$lib/stores/ui.svelte";
import { copyQrDecode, copyQrSvg } from "./actions";

export const qrCommand: Command = {
  id: "qr",
  prefix: "qr",
  title: "QR Code",
  titleZh: "二维码",
  description: "Generate a QR code",
  descriptionZh: "生成二维码",
  icon: "QrCode",
  run(input) {
    const text = input.trim();
    if (ui.view !== "qr") {
      ui.searchText = text ? `qr ${text}` : "qr ";
      ui.focusField = "search";
      return;
    }
    void copyQrSvg();
  },
};

export const qrDecodeCommand: Command = {
  id: "qrdecode",
  prefix: "qrd",
  title: "QR Decode",
  titleZh: "识码",
  description: "Read a QR code from the clipboard",
  descriptionZh: "从剪贴板图片识别二维码",
  icon: "ScanQrCode",
  run() {
    if (ui.view !== "qrdecode") {
      ui.searchText = "qrd ";
      ui.focusField = "search";
      return;
    }
    void copyQrDecode();
  },
};

register(qrCommand);
register(qrDecodeCommand);
