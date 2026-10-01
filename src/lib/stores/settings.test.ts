import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * The store talks to Rust through `invoke`, and two of its behaviours are only
 * observable in the order those calls are made: a capture that is armed for a
 * screen the user has already left, and the "return to the list" timer that
 * follows a save. Both are driven from here rather than from a rendered panel,
 * which is where they would otherwise be untestable.
 */
const { invoke } = vi.hoisted(() => ({
  invoke: vi.fn<(cmd: string, args?: Record<string, unknown>) => Promise<unknown>>(
    async (cmd: string) => {
      if (cmd === "list_browsers") return [];
      return null;
    },
  ),
}));

vi.mock("@tauri-apps/api/core", () => ({ invoke }));
vi.mock("@tauri-apps/api/event", () => ({ listen: () => Promise.resolve(() => {}) }));

import "$lib/commands/settings";
import {
  confirmRemoveEngine,
  handleSettingsEnter,
  runSettingItem,
} from "$lib/commands/settings/actions";
import { settings } from "$lib/stores/settings.svelte";
import { ui } from "$lib/stores/ui.svelte";

/** What `get_settings` and `update_setting` answer with. */
function stored(overrides: Record<string, unknown> = {}) {
  return {
    defaultSearchEngine: "bing",
    theme: "dark",
    hotkey: "",
    locale: "system",
    translateTarget: "",
    browser: "",
    customSearchEngines: [],
    clipTextRetentionDays: 7,
    ...overrides,
  };
}

type Handler = (args: Record<string, unknown> | undefined) => Promise<unknown>;
let handlers: Record<string, Handler> = {};

beforeEach(() => {
  invoke.mockClear();
  handlers = {};
  invoke.mockImplementation((cmd, args) => {
    const handler = handlers[cmd];
    if (handler) return handler(args);
    if (cmd === "get_settings" || cmd === "update_setting") return Promise.resolve(stored());
    return Promise.resolve(null);
  });
  settings.recording = false;
  settings.selectedIndex = 0;
  settings.engineDraft = null;
  ui.searchText = "";
});

afterEach(() => {
  vi.useRealTimers();
});

describe("arming the hotkey recorder", () => {
  it("holds the capture once it is armed", async () => {
    await settings.startRecording();
    expect(settings.recording).toBe(true);
    expect(invoke).not.toHaveBeenCalledWith("cancel_hotkey_capture");

    await settings.stopRecording();
    expect(settings.recording).toBe(false);
    expect(invoke).toHaveBeenCalledWith("cancel_hotkey_capture");
  });

  /**
   * Leaving the screen runs the cleanup while `recording` is still false, so the
   * cleanup cannot cancel a capture that has not been armed yet. Without the
   * store undoing its own late start, Rust keeps the palette's shortcut
   * unregistered with nothing on screen listening for a replacement — the
   * launcher's own hotkey stops working.
   */
  it("undoes a capture armed for a screen the user already left", async () => {
    let release!: () => void;
    handlers.begin_hotkey_capture = () =>
      new Promise<void>((resolve) => {
        release = resolve;
      });

    const armed = settings.startRecording();
    await vi.waitFor(() => expect(invoke).toHaveBeenCalledWith("begin_hotkey_capture"));
    await settings.stopRecording();

    release();
    await armed;

    expect(settings.recording).toBe(false);
    expect(invoke).toHaveBeenCalledWith("cancel_hotkey_capture");
  });
});

describe("returning to the settings list after a save", () => {
  it("takes the user back when the screen has not moved", async () => {
    vi.useFakeTimers();
    ui.searchText = "settings engine";

    await settings.setEngine("google");
    vi.advanceTimersByTime(1600);

    expect(ui.searchText).toBe("settings ");
  });

  /**
   * The timer belongs to the screen the save happened on. Ctrl+N opens the
   * engine form from any settings screen, and the arrows can be walked to
   * another one; landing back on the list from there would overwrite a move the
   * user made on purpose.
   */
  it("leaves a screen the user moved to alone", async () => {
    vi.useFakeTimers();
    ui.searchText = "settings engine";
    await settings.setEngine("google");

    ui.searchText = "settings theme";
    vi.advanceTimersByTime(1600);

    expect(ui.searchText).toBe("settings theme");
  });

  it("leaves the engine form alone while it is open", async () => {
    vi.useFakeTimers();
    ui.searchText = "settings engine";
    await settings.setEngine("google");

    settings.openEngineCreate();
    vi.advanceTimersByTime(1600);

    expect(ui.searchText).toBe("settings engine");
  });
});

describe("removing a custom engine", () => {
  /** Both ways in — the Delete key and the row's own button — go through this. */
  it("asks first, and only for an engine that can be removed", () => {
    confirmRemoveEngine({
      id: "custom_1",
      name: "GitHub",
      url: "https://github.com/search?q=%s",
      custom: true,
    });
    expect(ui.pendingConfirm?.action).toBe("GitHub");
    ui.cancelConfirm();

    confirmRemoveEngine({ id: "bing", name: "Bing", url: "https://www.bing.com/search?q=" });
    expect(ui.pendingConfirm).toBeNull();
  });
});

describe("a settings row", () => {
  it("does the same thing from the keyboard as from a click", async () => {
    ui.searchText = "settings ";
    settings.selectedIndex = settings.listItems.findIndex((item) => item.id === "theme");
    await handleSettingsEnter();
    expect(ui.searchText).toBe("settings theme");

    ui.searchText = "settings ";
    runSettingItem("theme");
    expect(ui.searchText).toBe("settings theme");
  });
});
