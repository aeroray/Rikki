import { describe, expect, it } from "vitest";

import { listRowKey } from "$lib/commands/settings/footer";
import type { SettingItem } from "$lib/stores/settings.svelte";

/**
 * Every row of the settings list, and what its Enter chip says.
 *
 * `Record<SettingItem["id"], …>` rather than a list of cases, so adding a row is
 * a compile error here until someone decides what its chip reads. That is the
 * same fail-closed shape `aliases.test.ts` uses for commands, and it matters for
 * the same reason: this list has twice shipped a row whose label did not
 * describe what Enter does to it.
 */
const CHIPS: Record<SettingItem["id"], string | null> = {
  engine: "key.open",
  browser: "key.open",
  theme: "key.open",
  hotkey: "settings.keyHotkey",
  autostart: "settings.keyAutostartOn",
  language: "key.open",
  retention: "key.open",
  cleanup: "settings.keyClean",
  export: "settings.keyExport",
  import: "settings.keyImport",
  update: "settings.keyCheck",
};

/**
 * A row with everything available and nothing running.
 *
 * Typed from the function's own parameter rather than written out, so the two
 * cannot drift and `clipTextRetentionDays: 7` stays the literal the union wants
 * instead of widening to `number`.
 */
const IDLE: Parameters<typeof listRowKey>[1] = {
  autostartEnabled: false,
  clipTextRetentionDays: 7,
  updateChecking: false,
};

describe("settings list Enter chips", () => {
  it("names what Enter does on every row", () => {
    for (const [id, key] of Object.entries(CHIPS)) {
      expect(listRowKey(id as SettingItem["id"], IDLE), id).toBe(key);
    }
  });

  it("flips the login row's wording with the state it is in", () => {
    expect(listRowKey("autostart", { ...IDLE, autostartEnabled: false })).toBe(
      "settings.keyAutostartOn",
    );
    expect(listRowKey("autostart", { ...IDLE, autostartEnabled: true })).toBe(
      "settings.keyAutostartOff",
    );
  });

  it("withholds a key that would do nothing", () => {
    // Cleaning is unavailable, and a check is already in flight.
    expect(listRowKey("cleanup", { ...IDLE, clipTextRetentionDays: 0 })).toBeNull();
    expect(listRowKey("update", { ...IDLE, updateChecking: true })).toBeNull();
  });
});
