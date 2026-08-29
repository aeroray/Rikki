import { register } from "$lib/commands/registry";
import type { Command } from "$lib/commands/types";
import { ui } from "$lib/stores/ui.svelte";
import { copyTimestampResult } from "./actions";

export const timestampCommand: Command = {
  id: "timestamp",
  prefix: "ts",
  aliases: ["timestamp", "时间戳"],
  title: "Timestamp",
  titleZh: "时间戳",
  description: "Convert timestamps and dates",
  descriptionZh: "在时间戳和日期之间转换",
  icon: "Clock",
  run(input) {
    const text = input.trim();
    if (ui.view !== "timestamp") {
      ui.searchText = text ? `ts ${text}` : "ts ";
      ui.focusField = "search";
      return;
    }
    void copyTimestampResult();
  },
};

register(timestampCommand);
