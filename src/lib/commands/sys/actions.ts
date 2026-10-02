import { delayOptions, needsConfirm, parseDelay } from "$lib/commands/sys/schedule";
import { i18n } from "$lib/i18n";
import { power } from "$lib/stores/power.svelte";
import { ui } from "$lib/stores/ui.svelte";

/** The five power commands, all of which take a delay. */
export type PowerAction = "lock" | "sleep" | "shutdown" | "restart" | "logout";

/** The command ids that open the power panel, and the action each one means. */
const ACTION_BY_COMMAND: Record<string, PowerAction> = {
  lock: "lock",
  sleep: "sleep",
  shutdown: "shutdown",
  reboot: "restart",
  logout: "logout",
};

/** The action the current view is about, from the command that matched. */
export function currentPowerAction(): PowerAction {
  return ACTION_BY_COMMAND[ui.matchedCommand?.id ?? ""] ?? "shutdown";
}

/** A command id whose row opens the power panel. */
export function isPowerCommand(id: string): boolean {
  return id in ACTION_BY_COMMAND;
}

/**
 * The confirmation text for each action that needs one.
 *
 * Explicit entries rather than `sys.${action}Now`, because the catalog is typed and
 * a template string is invisible to it: the key would compile, render as its own
 * name, and the unused-key test would flag the real one. Only three actions appear
 * here — lock and sleep never ask.
 */
const CONFIRM = {
  shutdown: { title: "sys.shutdownNow", body: "sys.shutdownBody" },
  restart: { title: "sys.rebootNow", body: "sys.rebootBody" },
  logout: { title: "sys.logoutNow", body: "sys.logoutBody" },
} as const;

/**
 * Runs the highlighted delay.
 *
 * One implementation for the panel's click and the key handler's Enter, because
 * both have to reach the same decision about confirmation and only the trigger
 * differs. `needsConfirm` is what decides: a delay is cancellable from the footer
 * and runs at once, while an immediate shutdown, restart or log out ends the
 * session and keeps the dialog those commands always had.
 */
export function commitPower(action: PowerAction, index: number): void {
  const options = delayOptions(ui.commandRest);
  const option = options[index] ?? options[0];
  if (!option) return;

  if (!needsConfirm(action, option.seconds)) {
    void power.schedule(action, option.seconds);
    return;
  }

  const text = CONFIRM[action as keyof typeof CONFIRM];
  if (!text) {
    // `needsConfirm` and `CONFIRM` disagree, which is a bug rather than a user
    // error: run it rather than silently doing nothing.
    void power.schedule(action, option.seconds);
    return;
  }
  ui.requestConfirm(
    i18n.t(text.title),
    () => void power.schedule(action, option.seconds),
    i18n.t(text.body),
  );
}

/** Whether the query is text the panel could not read as a delay. */
export function powerQueryUnreadable(): boolean {
  return Boolean(ui.commandRest.trim()) && parseDelay(ui.commandRest) === null;
}
