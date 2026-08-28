import { rankText } from "$lib/fuzzy";
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

export function rankCommand(query: string, command: Command): number {
  return Math.max(
    ...commandPrefixes(command).map((prefix) => rankText(query, prefix, command.title)),
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
      score: rankCommand(query, command),
    }))
    .filter((entry) => entry.score > 0)
    .sort((a, b) => b.score - a.score)
    .map((entry) => entry.command);
}
