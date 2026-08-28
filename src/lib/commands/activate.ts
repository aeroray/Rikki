import { ui } from "$lib/stores/ui.svelte";
import type { Command } from "./types";

export function isActionCommand(command: Command): boolean {
  return command.mode === "action";
}

export function activateCommand(command: Command): void {
  if (ui.matchedCommand?.id === command.id && ui.commandRest.trim()) {
    command.run(ui.commandRest);
    return;
  }
  if (isActionCommand(command)) {
    command.run("");
    return;
  }
  ui.searchText = `${command.prefix} `;
  ui.todoPanelOpen = command.id === "todo";
  ui.focusField = command.id === "todo" ? "todo-input" : "search";
}
