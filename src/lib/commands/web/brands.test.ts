import { describe, expect, it } from "vitest";
// Importing the commands registers them, which is what the last test reads.
import { engineIdForCommand } from "$lib/commands/web";
import { engineMark } from "$lib/commands/web/brands";
import { listCommands } from "$lib/commands/registry";
import { SEARCH_ENGINES } from "$lib/commands/settings/engines";

describe("search engine marks", () => {
  it("covers every engine the settings offer", () => {
    const missing = SEARCH_ENGINES.filter((engine) => !engineMark(engine.id)).map(
      (engine) => engine.id,
    );
    expect(missing).toEqual([]);
  });

  it("draws every mark in the colour of the field around it", () => {
    // A brand-coloured mark would be the one thing on screen not following the
    // palette, which is why the marks are the monochrome ones.
    for (const engine of SEARCH_ENGINES) {
      expect(engineMark(engine.id)?.body, engine.id).toContain("currentColor");
    }
  });

  it("has no mark for an engine it does not know", () => {
    // A custom engine is a URL the user typed, so the magnifier stays.
    expect(engineMark("custom_1758950000000")).toBeUndefined();
  });

  it("points every web command at an engine that has a mark", () => {
    const webCommands = listCommands().filter((command) => command.id.startsWith("web-"));
    expect(webCommands.length).toBeGreaterThan(0);
    for (const command of webCommands) {
      const engineId = engineIdForCommand(command.id);
      expect(engineId, command.id).not.toBeNull();
      expect(engineMark(engineId!), command.id).toBeDefined();
    }
  });

  it("answers with nothing for a command that is not a web search", () => {
    expect(engineIdForCommand("todo")).toBeNull();
  });
});
