import { register } from "$lib/commands/registry";
import type { Command } from "$lib/commands/types";
import { ui } from "$lib/stores/ui.svelte";

export const sysmonCommand: Command = {
  id: "sysmon",
  prefix: "sys",
  title: "System",
  titleZh: "系统状态",
  description: "CPU, memory, GPU and the busiest processes",
  descriptionZh: "CPU、内存、GPU 与占用最高的进程",
  icon: "Activity",
  run(input) {
    // Nothing to run: the panel reads and never writes. Enter on the row opens it,
    // and every key inside belongs to the panel.
    if (ui.view === "sysmon") return;
    const rest = input.trim();
    ui.searchText = rest ? `sys ${rest}` : "sys ";
    ui.focusField = "search";
  },
};

register(sysmonCommand);
