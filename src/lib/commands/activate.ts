import { i18n } from "$lib/i18n";
import { ui } from "$lib/stores/ui.svelte";
import type { Command } from "./types";

export function isActionCommand(command: Command): boolean {
  return command.mode === "action";
}

/** The short name for a command, without the `中文 · English` pairing. */
function shortTitle(command: Command): string {
  return i18n.locale === "zh-CN" && command.titleZh ? command.titleZh : command.title;
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
    // Commands that cannot be undone ask first, so a stray Enter on a completed
    // prefix still does not shut the machine down.
    if (command.confirm) {
      ui.requestConfirm(shortTitle(command), () => command.run(""));
      return;
    }
    command.run("");
    return;
  }
  ui.searchText = `${command.prefix} `;
  ui.todoPanelOpen = command.id === "todo";
  // Always the search field, including for todo: the panel has no input row of
  // its own any more, so sending the cursor anywhere else would leave the user
  // with a list and nothing to type into.
  ui.focusField = "search";
}
