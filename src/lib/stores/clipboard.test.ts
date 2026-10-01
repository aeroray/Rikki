import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * A QR decode reads the clipboard image through the Rust plugin, and what that
 * read leaves behind is the whole point: no history row, and no deleted file
 * when the name the plugin returns is one an entry already points at.
 */
const { invoke, readImage } = vi.hoisted(() => ({
  invoke: vi.fn<(cmd: string, args?: Record<string, unknown>) => Promise<unknown>>(),
  readImage: vi.fn<() => Promise<unknown>>(),
}));

vi.mock("@tauri-apps/api/core", () => ({ invoke, convertFileSrc: (path: string) => path }));
vi.mock("@tauri-apps/api/event", () => ({ listen: () => Promise.resolve(() => {}) }));
vi.mock("tauri-plugin-clipboard-x-api", () => ({
  hasFiles: () => Promise.resolve(false),
  hasImage: () => Promise.resolve(false),
  hasText: () => Promise.resolve(false),
  readImage,
  readText: () => Promise.resolve(""),
  startListening: () => Promise.resolve(),
  writeImage: () => Promise.resolve(),
  writeText: () => Promise.resolve(),
}));

import { clipboard } from "$lib/stores/clipboard.svelte";

const IMAGES = "C:\\Users\\me\\AppData\\Roaming\\rikki\\clipboard\\images";
const IMAGE = `${IMAGES}\\abc.png`;

beforeEach(async () => {
  invoke.mockReset();
  readImage.mockReset();
  invoke.mockImplementation((cmd) => {
    if (cmd === "get_clipboard_images_dir") return Promise.resolve(IMAGES);
    if (cmd === "get_clipboard_history") return Promise.resolve([]);
    if (cmd === "read_clipboard_image") return Promise.resolve([1, 2, 3]);
    return Promise.resolve(null);
  });
  clipboard.entries = [];
  await clipboard.start();
});

afterEach(() => {
  vi.clearAllMocks();
});

describe("reading the clipboard image for a decode", () => {
  it("returns the bytes without recording a clip", async () => {
    readImage.mockResolvedValue({ path: IMAGE, size: 3, width: 1, height: 1 });

    const bytes = await clipboard.readCurrentImage();

    expect(Array.from(bytes ?? [])).toEqual([1, 2, 3]);
    expect(clipboard.entries).toEqual([]);
    expect(invoke).not.toHaveBeenCalledWith("save_clipboard_history", expect.anything());
  });

  it("discards the file the plugin wrote for the read", async () => {
    readImage.mockResolvedValue({ path: IMAGE, size: 3, width: 1, height: 1 });

    await clipboard.readCurrentImage();

    expect(invoke).toHaveBeenCalledWith("discard_clipboard_image", { path: IMAGE });
  });

  /**
   * The plugin names the file after a hash of the image bytes, so an image that
   * is already in the history resolves to the entry's own file. Deleting that
   * leaves a clip row that can never be previewed or pasted.
   */
  it("keeps a file an entry already references", async () => {
    clipboard.entries = [
      { id: "clip_1", type: "image", content: IMAGE, appName: "", createdAt: 1, pinned: false },
    ];
    readImage.mockResolvedValue({ path: IMAGE, size: 3, width: 1, height: 1 });

    await clipboard.readCurrentImage();

    expect(invoke).not.toHaveBeenCalledWith("discard_clipboard_image", expect.anything());
  });

  it("reports nothing when the clipboard holds no image", async () => {
    readImage.mockRejectedValue("No image data in clipboard");

    await expect(clipboard.readCurrentImage()).resolves.toBeNull();
    expect(invoke).not.toHaveBeenCalledWith("discard_clipboard_image", expect.anything());
  });
});
