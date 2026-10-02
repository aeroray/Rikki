import { delayOptions, parseDelay } from "$lib/commands/sys/schedule";
import { i18n } from "$lib/i18n";
import { power } from "$lib/stores/power.svelte";
import { ui } from "$lib/stores/ui.svelte";

/** Which power command opened the panel. */
export type PowerAction = "shutdown" | "restart";

/** The action the current view is about, from the command that matched. */
export function currentPowerAction(): PowerAction {
  return ui.matchedCommand?.id === "reboot" ? "restart" : "shutdown";
}

/**
 * Runs the highlighted delay.
 *
 * One implementation for the panel's click and the key handler's Enter, because
 * both have to reach the same decision about confirmation and only the trigger
 * differs: a delay can be cancelled from the footer, so it runs at once, while
 * "now" cannot be taken back and keeps the dialog the command had before this
 * panel existed.
 */
export function commitPower(action: PowerAction, index: number): void {
  const options = delayOptions(ui.commandRest);
  const option = options[index] ?? options[0];
  if (!option) return;

  if (option.seconds > 0) {
    void power.schedule(action, option.seconds);
    return;
  }

  const shuttingDown = action === "shutdown";
  ui.requestConfirm(
    i18n.t(shuttingDown ? "sys.shutdownNow" : "sys.rebootNow"),
    () => void power.schedule(action, 0),
    i18n.t(shuttingDown ? "sys.shutdownBody" : "sys.rebootBody"),
  );
}

/** Whether the query is text the panel could not read as a delay. */
export function powerQueryUnreadable(): boolean {
  return Boolean(ui.commandRest.trim()) && parseDelay(ui.commandRest) === null;
}
