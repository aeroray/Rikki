import { writeText } from "tauri-plugin-clipboard-x-api";
import { emojiCategories, emojisInCategory, searchEmojis } from "$lib/commands/emoji/data";
import { parseEmojiScreen } from "$lib/commands/emoji/parse";
import { i18n } from "$lib/i18n";
import { clipboard } from "$lib/stores/clipboard.svelte";
import { ui } from "$lib/stores/ui.svelte";

class EmojiStore {
  selectedIndex = $state(0);
  notice = $state<string | null>(null);
  readonly categories = emojiCategories;
  private noticeTimer: ReturnType<typeof setTimeout> | null = null;
  private hideTimer: ReturnType<typeof setTimeout> | null = null;

  visible(rest: string) {
    const screen = parseEmojiScreen(rest);
    if (screen.type === "category") return emojisInCategory(screen.category.id);
    if (screen.type === "search") return searchEmojis(screen.query);
    return [];
  }

  clampSelection(count: number) {
    if (this.selectedIndex < 0) this.selectedIndex = 0;
    if (count === 0) {
      this.selectedIndex = 0;
      return;
    }
    if (this.selectedIndex >= count) this.selectedIndex = count - 1;
  }

  move(delta: number, count: number) {
    if (count === 0) return;
    this.selectedIndex = Math.max(0, Math.min(count - 1, this.selectedIndex + delta));
  }

  async copy(native: string): Promise<boolean> {
    try {
      clipboard.suppressNextCapture();
      try {
        await writeText(native);
      } catch (err) {
        clipboard.suppressNextCapture(false);
        throw err;
      }
      this.flash(i18n.t("emoji.copied", { glyph: native }));
      const nonce = ui.showNonce;
      if (this.hideTimer) clearTimeout(this.hideTimer);
      this.hideTimer = setTimeout(() => {
        this.hideTimer = null;
        if (ui.showNonce === nonce) ui.beginHide({ reset: true });
      }, 1200);
      return true;
    } catch {
      return false;
    }
  }

  private flash(message: string) {
    this.notice = message;
    if (this.noticeTimer) clearTimeout(this.noticeTimer);
    this.noticeTimer = setTimeout(() => {
      this.notice = null;
      this.noticeTimer = null;
    }, 1200);
  }
}

export const emojis = new EmojiStore();
