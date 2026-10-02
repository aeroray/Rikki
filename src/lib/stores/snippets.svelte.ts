import { writeClipboardText } from "$lib/clipboard/write";
import { invoke } from "@tauri-apps/api/core";
import { expandSnippetContent } from "$lib/commands/snippet/expand";
import { snippetListQuery } from "$lib/commands/snippet/parse";
import type { Snippet } from "$lib/commands/types";
import { fuzzyScore } from "$lib/fuzzy";
import { i18n } from "$lib/i18n";
import { ui, type NoticeTone } from "$lib/stores/ui.svelte";

export type SnippetDraft = {
  id: string | null;
  title: string;
  keyword: string;
  content: string;
  sensitive: boolean;
};

class SnippetStore {
  items = $state<Snippet[]>([]);
  selectedIndex = $state(0);
  draft = $state<SnippetDraft | null>(null);
  notice = $state<string | null>(null);
  /** Whether that notice is good news, which decides its glyph in the footer. */
  noticeTone = $state<NoticeTone>("info");
  private ready: Promise<void>;
  private noticeTimer: ReturnType<typeof setTimeout> | null = null;

  constructor() {
    this.ready = this.hydrate();
  }

  filtered(rest: string): Snippet[] {
    const q = snippetListQuery(rest).trim();
    if (!q) {
      return [...this.items].sort((a, b) => b.updatedAt - a.updatedAt);
    }
    return this.items
      .map((snippet) => ({ snippet, score: snippetScore(q, snippet) }))
      .filter((entry) => entry.score > 0)
      .sort((a, b) => b.score - a.score || b.snippet.updatedAt - a.snippet.updatedAt)
      .map((entry) => entry.snippet);
  }

  clampSelection(count: number) {
    if (this.selectedIndex < 0) this.selectedIndex = 0;
    if (count === 0) {
      this.selectedIndex = 0;
      return;
    }
    if (this.selectedIndex >= count) {
      this.selectedIndex = count - 1;
    }
  }

  /**
   * Re-opening the composer while an unsaved new draft is on screen keeps all
   * four fields. Ctrl+N is also the "focus the composer" shortcut, and the old
   * mix wiped only the title — the field typed first — while keeping keyword,
   * content and the sensitive flag. Esc already closes the draft, so discarding
   * stays an explicit gesture. An edit draft (id !== null) still starts blank.
   */
  openCreate(title = "", content = "") {
    const inProgress = this.draft?.id === null ? this.draft : null;
    this.draft = {
      id: null,
      title: title || inProgress?.title || "",
      keyword: inProgress?.keyword ?? "",
      content: content || inProgress?.content || "",
      sensitive: inProgress?.sensitive ?? false,
    };
    ui.focusField = "snippet-title";
  }

  openEdit(snippet: Snippet) {
    this.draft = {
      id: snippet.id,
      title: snippet.title,
      keyword: snippet.keyword,
      content: snippet.content,
      sensitive: snippet.sensitive,
    };
    ui.focusField = "snippet-title";
  }

  closeDraft() {
    this.draft = null;
    ui.focusField = "search";
  }

  async reload() {
    await this.hydrate();
  }

  async saveDraft(): Promise<boolean> {
    const draft = this.draft;
    if (!draft) return false;
    const title = draft.title.trim();
    const content = draft.content.trim();
    const keyword = draft.keyword.trim();
    if (!title || !content) return false;
    if (draft.id) {
      const ok = await this.update(draft.id, title, content, keyword, draft.sensitive);
      if (ok) this.closeDraft();
      return ok;
    }
    const created = await this.create(title, content, keyword, draft.sensitive);
    if (created) this.closeDraft();
    return created;
  }

  async create(title: string, content: string, keyword = "", sensitive = false): Promise<boolean> {
    await this.ready;
    const name = title.trim();
    const body = content.trim();
    if (!name || !body) return false;
    try {
      const snippet = await invoke<Snippet>("create_snippet", {
        title: name,
        content: body,
        keyword: keyword.trim() || null,
        sensitive,
      });
      this.items = [snippet, ...this.items.filter((item) => item.id !== snippet.id)];
      this.selectedIndex = 0;
      this.flash(i18n.t("snippet.created", { title: snippet.title }), "success");
      ui.searchText = "sn ";
      return true;
    } catch {
      // Returning false alone left the draft open with nothing on screen to say
      // why, so a failing write looked like the shortcut had not registered.
      this.flash(i18n.t("snippet.saveFailed"));
      return false;
    }
  }

  async update(
    id: string,
    title: string,
    content: string,
    keyword: string,
    sensitive: boolean,
  ): Promise<boolean> {
    await this.ready;
    try {
      const snippet = await invoke<Snippet>("update_snippet", {
        id,
        title: title.trim(),
        content: content.trim(),
        keyword,
        sensitive,
      });
      this.items = this.items.map((item) => (item.id === id ? snippet : item));
      this.flash(i18n.t("snippet.updated", { title: snippet.title }), "success");
      return true;
    } catch {
      this.flash(i18n.t("snippet.saveFailed"));
      return false;
    }
  }

  async remove(id: string): Promise<boolean> {
    await this.ready;
    const current = this.items.find((item) => item.id === id);
    try {
      await invoke("delete_snippet", { id });
      this.items = this.items.filter((item) => item.id !== id);
      if (this.draft?.id === id) this.closeDraft();
      this.flash(
        current ? i18n.t("snippet.deleted", { title: current.title }) : i18n.t("snippet.deletedGeneric"),
        "success",
      );
      return true;
    } catch {
      return false;
    }
  }

  async copy(id: string): Promise<boolean> {
    await this.ready;
    const snippet = this.items.find((item) => item.id === id);
    if (!snippet) return false;
    try {
      const text = await expandSnippetContent(snippet.content);
      const ok = await writeClipboardText(text);
      if (!ok) {
        ui.flash(i18n.t("copy.failed"));
        return false;
      }
      ui.beginHide({ reset: true });
      return true;
    } catch {
      ui.flash(i18n.t("copy.failed"));
      return false;
    }
  }

  private flash(message: string, tone: NoticeTone = "info") {
    this.notice = message;
    this.noticeTone = tone;
    if (this.noticeTimer) clearTimeout(this.noticeTimer);
    this.noticeTimer = setTimeout(() => {
      this.notice = null;
      this.noticeTone = "info";
      this.noticeTimer = null;
    }, 2000);
  }

  private async hydrate() {
    try {
      this.items = (await invoke<Snippet[]>("get_snippets")).map((snippet) => ({
        ...snippet,
        sensitive: Boolean(snippet.sensitive),
      }));
    } catch {
      this.items = [];
    }
  }
}

function snippetScore(query: string, snippet: Snippet): number {
  const keyword = snippet.keyword.toLowerCase();
  const q = query.toLowerCase();
  if (keyword && keyword === q) return 200;
  if (keyword && keyword.startsWith(q)) return 160;
  const fields = [snippet.title, snippet.keyword, ...snippet.tags];
  if (!snippet.sensitive) fields.push(snippet.content);
  return Math.max(0, ...fields.map((field) => fuzzyScore(query, field)));
}

export const snippets = new SnippetStore();
