import type { InstalledBrowser } from "$lib/commands/types";
import { i18n } from "$lib/i18n";

/** No executable: Rust falls back to whatever the OS opens links with. */
const SYSTEM_BROWSER_PATH = "";

/**
 * One row of the picker.
 *
 * `id` is the key the list is rendered with, `path` is what gets stored — the
 * system-default row has a name and an id but no path, so the two cannot be the
 * same field. `icon` is empty for that row, and for a browser whose icon could
 * not be extracted.
 */
export type BrowserOption = {
  id: string;
  name: string;
  path: string;
  icon: string;
};

export function browserOptionList(installed: InstalledBrowser[]): BrowserOption[] {
  return [
    { id: "system", name: i18n.t("settings.browser.system"), path: SYSTEM_BROWSER_PATH, icon: "" },
    ...installed.map((browser) => ({
      id: browser.id,
      name: browser.name,
      path: browser.path,
      icon: browser.icon,
    })),
  ];
}

/**
 * The settings row's value.
 *
 * A stored path that detection did not offer — a hand-edited `settings.json`,
 * or a browser registered after the list was read — still has to read as
 * something. The executable's file name is the honest answer, and it beats an
 * empty row.
 */
export function browserDisplayName(path: string, installed: InstalledBrowser[]): string {
  if (!path) return i18n.t("settings.browser.system");
  const match = installed.find((browser) => browser.path === path);
  if (match) return match.name;
  return path.split(/[\\/]/).pop() || i18n.t("settings.browser.system");
}
