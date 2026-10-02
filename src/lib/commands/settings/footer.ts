import type { ClipRetentionDays } from "$lib/commands/clip/cleanup";
import type { MessageKey } from "$lib/i18n";
import type { SettingItem } from "$lib/stores/settings.svelte";

/**
 * What the Enter chip on one row of the settings list says, as an i18n key.
 *
 * A key rather than a rendered chip, and a function rather than a branch inside
 * the panel, because the mapping is the thing worth checking. This list has
 * twice shipped a row whose label did not describe what Enter does to it: the
 * hotkey row said 打开 over a key that opens nothing, and the login row said 打开
 * over a key that flips a switch. `footer.test.ts` pins every row.
 *
 * `null` means the row has nothing to offer, so the chip is withheld: cleanup
 * while retention is off, and update while a check is already running. Offering
 * a key that does nothing is the same fault as naming the wrong action, and the
 * panel's message slot is where the reason goes instead.
 */
export function listRowKey(
  id: SettingItem["id"],
  state: {
    autostartEnabled: boolean;
    clipTextRetentionDays: ClipRetentionDays;
    updateChecking: boolean;
  },
): MessageKey | null {
  if (id === "cleanup") {
    return state.clipTextRetentionDays > 0 ? "settings.keyClean" : null;
  }
  if (id === "autostart") {
    // The direction the key would take the setting, not the state it is in: the
    // row already says 已开启, and what the user needs is what Enter will do.
    return state.autostartEnabled ? "settings.keyAutostartOff" : "settings.keyAutostartOn";
  }
  if (id === "hotkey") {
    // Not `key.open`: Enter opens no list here. It puts the recorder on screen
    // and waits for a key.
    return "settings.keyHotkey";
  }
  if (id === "export") return "settings.keyExport";
  if (id === "import") return "settings.keyImport";
  if (id === "update") return state.updateChecking ? null : "settings.keyCheck";
  // engine, browser, theme, language and retention each open a list of their own.
  return "key.open";
}
