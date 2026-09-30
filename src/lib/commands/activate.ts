import { ui } from "$lib/stores/ui.svelte";
import type { Command } from "./types";

export function isActionCommand(command: Command): boolean {
  return command.mode === "action";
}

export function activateCommand(command: Command): void {
  const explicitlyMatched = ui.matchedCommand?.id === command.id;
  if (explicitlyMatched && ui.commandRest.trim()) {
    command.run(ui.commandRest);
    return;
  }
  // An action command fires immediately, but only once the user has actually
  // typed its prefix. `reb` fuzzy-matches `reboot` as the only hit, and running
  // it from there means a half-typed word shuts the machine down with no way
  // back. Falling through completes the prefix instead, so the destructive
  // commands always need the prefix on screen and a second Enter.
  if (isActionCommand(command) && explicitlyMatched) {
    command.run("");
    return;
  }
  ui.searchText = `${command.prefix} `;
  ui.todoPanelOpen = command.id === "todo";
  ui.focusField = command.id === "todo" ? "todo-input" : "search";
}
