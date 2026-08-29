import { register } from "$lib/commands/registry";
import type { Command } from "$lib/commands/types";
import { ui } from "$lib/stores/ui.svelte";
import { copyBase64Result } from "./actions";

function openBase64(input: string, decode: boolean) {
  const prefix = decode ? "b64d" : "b64";
  const text = input.trim();
  ui.searchText = text ? `${prefix} ${text}` : `${prefix} `;
  ui.focusField = "search";
}

export const base64Command: Command = {
  id: "base64",
  prefix: "b64",
  aliases: ["base64"],
  title: "Base64 Encode",
  titleZh: "编码",
  description: "Encode text as Base64",
  descriptionZh: "把文本编码成 Base64",
  icon: "Binary",
  run(input) {
    if (ui.view !== "base64") {
      openBase64(input, false);
      return;
    }
    void copyBase64Result();
  },
};

export const base64DecodeCommand: Command = {
  id: "base64d",
  prefix: "b64d",
  aliases: ["base64d"],
  title: "Base64 Decode",
  titleZh: "解码",
  description: "Decode Base64 text",
  descriptionZh: "把 Base64 解码成文本",
  icon: "Binary",
  run(input) {
    if (ui.view !== "base64") {
      openBase64(input, true);
      return;
    }
    void copyBase64Result();
  },
};

register(base64Command);
register(base64DecodeCommand);
