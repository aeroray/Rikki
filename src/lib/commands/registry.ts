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
