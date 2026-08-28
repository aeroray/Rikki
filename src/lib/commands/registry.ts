import { rankText } from "$lib/fuzzy";
import type { Command, CommandMatch } from "./types";

const commands = new Map<string, Command>();

export function register(command: Command): void {
  commands.set(command.id, command);
}

export function listCommands(): Command[] {
  return [...commands.values()];
}

export function match(input: string): CommandMatch | null {
  const lower = input.toLowerCase();
  for (const command of commands.values()) {
    const prefix = command.prefix.toLowerCase();
    if (lower === prefix) {
      return { command, rest: "" };
    }
    const withSpace = `${prefix} `;
    if (lower.startsWith(withSpace)) {
      return { command, rest: input.slice(withSpace.length) };
    }
  }
  return null;
}

export function suggest(input: string): Command[] {
  const query = input.trim();
  if (!query) return [];
  if (match(input)) return [];

  return listCommands()
    .map((command) => ({
      command,
      score: rankText(query, command.prefix, command.title),
    }))
    .filter((entry) => entry.score > 0)
    .sort((a, b) => b.score - a.score)
    .map((entry) => entry.command);
}
