import { i18n } from "$lib/i18n";

/**
 * What the data an import is about to replace holds, as the confirmation reads
 * it.
 *
 * The counts come from the stores on screen rather than from the file: they are
 * what the import takes away, and the file the user just picked in a system
 * dialog does not need describing back to them.
 */
export function transferCounts(todos: number, snippets: number): string {
  return [
    i18n.t("settings.transfer.countTodos", { count: todos }),
    i18n.t("settings.transfer.countSnippets", { count: snippets }),
    i18n.t("settings.transfer.settings"),
  ].join(i18n.t("settings.transfer.join"));
}

/**
 * `2026-10-01-143205`: the local clock, in the shape of the file name it becomes.
 *
 * The name is built here rather than in Rust because Rust has no local clock
 * without another dependency, and the name is what the user reads in Explorer or
 * Finder — a name eight hours off their watch is the kind of detail that makes
 * an exported file look like the wrong one.
 */
export function exportStamp(at: Date): string {
  const pad = (value: number) => String(value).padStart(2, "0");
  return [
    `${at.getFullYear()}-${pad(at.getMonth() + 1)}-${pad(at.getDate())}`,
    `${pad(at.getHours())}${pad(at.getMinutes())}${pad(at.getSeconds())}`,
  ].join("-");
}
