import { parseEmojiScreen } from "$lib/commands/emoji/parse";
import { emojis } from "$lib/stores/emojis.svelte";
import { ui } from "$lib/stores/ui.svelte";
import { EMOJI_GRID_COLS } from "$lib/commands/emoji/categories";

export function openEmojiCategory(name: string): void {
  ui.searchText = `em ${name}`;
  ui.focusField = "search";
  emojis.selectedIndex = 0;
}

export function closeEmojiDrill(): boolean {
  if (ui.view !== "emoji") return false;
  if (parseEmojiScreen(ui.commandRest).type === "categories") return false;
  ui.searchText = "em ";
  ui.focusField = "search";
  emojis.selectedIndex = 0;
  return true;
}

export function handleEmojiEnter(): void {
  const screen = parseEmojiScreen(ui.commandRest);
  if (screen.type === "categories") {
    const category = emojis.categories[emojis.selectedIndex];
    if (category) openEmojiCategory(category.id);
    return;
  }
  const item = emojis.visible(ui.commandRest)[emojis.selectedIndex];
  if (item) void emojis.copy(item.native);
}

export function handleEmojiArrow(key: string): boolean {
  const screen = parseEmojiScreen(ui.commandRest);
  if (screen.type === "categories") {
    const count = emojis.categories.length;
    if (key === "ArrowDown") {
      emojis.move(1, count);
      return true;
    }
    if (key === "ArrowUp") {
      emojis.move(-1, count);
      return true;
    }
    return false;
  }
  const count = emojis.visible(ui.commandRest).length;
  if (count === 0) return false;
  if (key === "ArrowRight") {
    emojis.move(1, count);
    return true;
  }
  if (key === "ArrowLeft") {
    emojis.move(-1, count);
    return true;
  }
  if (key === "ArrowDown") {
    emojis.move(EMOJI_GRID_COLS, count);
    return true;
  }
  if (key === "ArrowUp") {
    emojis.move(-EMOJI_GRID_COLS, count);
    return true;
  }
  return false;
}
