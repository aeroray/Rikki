import { rankText } from "$lib/fuzzy";
import { i18n } from "$lib/i18n";
import type { Locale } from "$lib/i18n/locale";
import type { Command, CommandMatch } from "./types";

const commands = new Map<string, Command>();

export function register(command: Command): void {
  commands.set(command.id, command);
}

export function listCommands(): Command[] {
  return [...commands.values()];
}

/** Default empty-home order when usage counts are tied or missing. */
export const HOME_COMMAND_ORDER = [
  "clip",
  "snippet",
  "todo",
  "calc",
  "anniversary",
  "emoji",
  "translate",
  "color",
  "json",
  "timestamp",
  "qr",
  "qrdecode",
  "base64",
  "base64d",
  "settings",
  "web-gg",
  "web-bd",
  "web-bing",
  "web-ddg",
  "web-sogou",
] as const;

const HOME_RANK = new Map<string, number>(HOME_COMMAND_ORDER.map((id, index) => [id, index]));

export function listHomeCommands(counts: Record<string, number>): Command[] {
  const fallback = HOME_COMMAND_ORDER.length;
  return listCommands()
    .filter((command) => command.mode !== "action")
    .sort((a, b) => {
      const usage = (counts[b.id] ?? 0) - (counts[a.id] ?? 0);
      if (usage !== 0) return usage;
      return (HOME_RANK.get(a.id) ?? fallback) - (HOME_RANK.get(b.id) ?? fallback) || a.id.localeCompare(b.id);
    });
}

export function homeUsageCommandId(
  view: string,
  matchedId: string | null,
  searchText: string,
  commandRest: string,
): string | null {
  if (view === "empty") return null;
  if (view === "suggest") {
    if (matchedId && (commandRest.length > 0 || searchText.endsWith(" "))) return matchedId;
    return null;
  }
  if (view === "color") return matchedId ?? "color";
  if (view === "base64") return matchedId ?? "base64";
  return view;
}

export function commandPrefixes(command: Command): string[] {
  return [command.prefix, ...(command.aliases ?? [])];
}

export function rankCommand(query: string, command: Command, locale: Locale): number {
  const titles =
    locale === "zh-CN"
      ? [command.title, command.titleZh, command.titleZh ? `${command.titleZh} · ${command.title}` : ""]
      : [command.title];
  return Math.max(
    0,
    ...commandPrefixes(command).flatMap((prefix) =>
      titles.filter((title): title is string => Boolean(title)).map((title) => rankText(query, prefix, title)),
    ),
  );
}

export function match(input: string): CommandMatch | null {
  const lower = input.toLowerCase();
  let best: CommandMatch | null = null;
  let bestLength = -1;

  for (const command of commands.values()) {
    const prefixes = commandPrefixes(command)
      .map((prefix) => prefix.toLowerCase())
      .sort((a, b) => b.length - a.length);
    for (const prefix of prefixes) {
      if (prefix.length <= bestLength) continue;
      if (lower === prefix) {
        best = { command, rest: "" };
        bestLength = prefix.length;
        continue;
      }
      const withSpace = `${prefix} `;
      if (lower.startsWith(withSpace)) {
        best = { command, rest: input.slice(withSpace.length) };
        bestLength = prefix.length;
      }
    }
  }

  return best;
}

export function suggest(input: string): Command[] {
  const query = input.trim();
  if (!query) return [];
  if (match(input)) return [];

  return listCommands()
    .map((command) => ({
      command,
      score: rankCommand(query, command, i18n.locale),
    }))
    .filter((entry) => entry.score > 0)
    .sort((a, b) => b.score - a.score)
    .map((entry) => entry.command);
}
