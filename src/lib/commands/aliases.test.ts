import { describe, expect, it } from "vitest";
// Registering the commands is what populates the registry these tests read.
import "$lib/commands/anniversary";
import "$lib/commands/base64";
import "$lib/commands/calc";
import "$lib/commands/calendar";
import "$lib/commands/clip";
import "$lib/commands/color";
import "$lib/commands/emoji";
import "$lib/commands/json";
import "$lib/commands/qrcode";
import "$lib/commands/settings";
import "$lib/commands/snippet";
import "$lib/commands/sys";
import "$lib/commands/timestamp";
import "$lib/commands/todo";
import "$lib/commands/translate";
import "$lib/commands/web";
import { COMMAND_ALIASES } from "$lib/commands/aliases";
import { listCommands, match, rankCommand } from "$lib/commands/registry";

const commands = listCommands();
const byId = new Map(commands.map((command) => [command.id, command]));

/** Every spelling a command answers to, prefix included. */
function spellings(id: string): string[] {
  const command = byId.get(id)!;
  return [command.prefix, ...(command.aliases ?? [])];
}

describe("the command vocabulary", () => {
  it("covers every registered command", () => {
    const missing = commands.filter((command) => !(command.id in COMMAND_ALIASES));
    expect(missing.map((command) => command.id)).toEqual([]);
  });

  it("has no entry left behind by a removed command", () => {
    const ids = new Set(commands.map((command) => command.id));
    expect(Object.keys(COMMAND_ALIASES).filter((id) => !ids.has(id))).toEqual([]);
  });

  it("never lets two commands claim the same spelling", () => {
    // A duplicate would make one of the two unreachable, and which one wins
    // depends on registration order — so it would look like a command that
    // silently stopped working.
    const owners = new Map<string, string>();
    const clashes: string[] = [];
    for (const command of commands) {
      for (const spelling of spellings(command.id)) {
        const key = spelling.toLowerCase();
        const owner = owners.get(key);
        if (owner && owner !== command.id) {
          clashes.push(`"${spelling}" claimed by ${owner} and ${command.id}`);
        }
        owners.set(key, command.id);
      }
    }
    expect(clashes).toEqual([]);
  });

  it("resolves every spelling through the prefix matcher", () => {
    for (const command of commands) {
      for (const spelling of spellings(command.id)) {
        expect(match(spelling)?.command.id, spelling).toBe(command.id);
        expect(match(`${spelling} 1`)?.command.id, spelling).toBe(command.id);
      }
    }
  });
});

describe("input an IME produces", () => {
  it("accepts the ideographic space as the prefix separator", () => {
    // A Chinese IME's space bar emits U+3000, and the prefix syntax is
    // `prefix + " "`, so this used to match nothing at all.
    const found = match("ann\u30001001");
    expect(found?.command.id).toBe("anniversary");
    expect(found?.rest).toBe("1001");
  });

  it("accepts full-width latin", () => {
    expect(match("\uff43\uff41\uff4c")?.command.id).toBe("calendar");
  });
});

describe("pinyin", () => {
  const cases: Array<[string, string]> = [
    // Initials, which is the shortest thing a Chinese user can type.
    ["wnl", "calendar"],
    ["jnr", "anniversary"],
    ["jsq", "calc"],
    ["jtb", "clip"],
    ["cq", "reboot"],
    ["fy", "translate"],
    // Full pinyin.
    ["wannianli", "calendar"],
    ["chongqi", "reboot"],
    // An alias whose wording differs from the title: `rili` has to reach the
    // calendar even though its Chinese title is 万年历.
    ["rili", "calendar"],
    ["jisuan", "calc"],
  ];

  it.each(cases)("%s finds %s", (query, id) => {
    const ranked = commands
      .map((command) => ({ id: command.id, score: rankCommand(query, command, "zh-CN") }))
      .sort((a, b) => b.score - a.score);
    expect(ranked[0]?.id).toBe(id);
    expect(ranked[0]?.score).toBeGreaterThan(0);
  });
});
