import { writeClipboardText } from "$lib/clipboard/write";
import { EMOJI_CATEGORIES } from "$lib/commands/emoji/categories";
import { emojisInCategory, loadEmojiData, searchEmojis, type EmojiCategoryPack, type PackedEmoji } from "$lib/commands/emoji/data";
import { parseEmojiScreen } from "$lib/commands/emoji/parse";
import type { EmojiItem } from "$lib/commands/emoji/types";
import { i18n } from "$lib/i18n";
import { ui } from "$lib/stores/ui.svelte";

class EmojiStore {
  selectedIndex = $state(0);
  notice = $state<string | null>(null);
  ready = $state(false);
  loading = $state(false);
  categories = $state<EmojiCategoryPack[]>(emptyCategories());
  private all: PackedEmoji[] = [];
  private noticeTimer: ReturnType<typeof setTimeout> | null = null;
  private hideTimer: ReturnType<typeof setTimeout> | null = null;
  private pending: Promise<void> | null = null;

  visible(rest: string): EmojiItem[] {
    if (!this.ready) return [];
    const screen = parseEmojiScreen(rest);
    if (screen.type === "category") return emojisInCategory(screen.category.id, this.categories);
    if (screen.type === "search") return searchEmojis(screen.query, this.all);
    return [];
  }

  ensure(): Promise<void> {
    if (this.ready) return Promise.resolve();
    this.pending ??= this.load();
    return this.pending;
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
      const ok = await writeClipboardText(native);
      if (!ok) {
        ui.flash(i18n.t("copy.failed"));
        return false;
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
      ui.flash(i18n.t("copy.failed"));
      return false;
    }
  }

  private async load() {
    this.loading = true;
    try {
      const pack = await loadEmojiData();
      this.categories = pack.categories;
      this.all = pack.all;
      this.ready = true;
    } finally {
      this.loading = false;
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

function emptyCategories(): EmojiCategoryPack[] {
  return EMOJI_CATEGORIES.map((category) => ({ ...category, emojis: [] }));
}

export const emojis = new EmojiStore();
