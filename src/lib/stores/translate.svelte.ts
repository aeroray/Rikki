import { writeClipboardText } from "$lib/clipboard/write";
import { invoke } from "@tauri-apps/api/core";
import { parseTranslateInput, type TranslateQuery } from "$lib/commands/translate/parse";
import type { TranslateResponse } from "$lib/commands/translate/types";
import { i18n } from "$lib/i18n";
import { settings } from "$lib/stores/settings.svelte";
import { ui } from "$lib/stores/ui.svelte";

class TranslateStore {
  result = $state<TranslateResponse | null>(null);
  query = $state<TranslateQuery>({ source: "auto", target: "zh", text: "" });
  loading = $state(false);
  error = $state<string | null>(null);
  private seq = 0;
  private done: TranslateQuery | null = null;

  readonly wordMode = $derived(Boolean(this.result?.hasDict));

  preview(rest: string) {
    const query = parseQuery(rest);
    const previous = this.query;
    this.query = query;
    if (!query.text) {
      this.seq += 1;
      this.loading = false;
      this.result = null;
      this.error = null;
      this.done = null;
      return;
    }
    if (this.loading && !sameQuery(previous, query)) {
      this.seq += 1;
      this.loading = false;
      this.result = null;
      this.error = null;
      this.done = null;
      return;
    }
    if (this.done && !sameQuery(this.done, query)) {
      this.result = null;
      this.error = null;
      this.done = null;
    }
  }

  async submit(): Promise<boolean> {
    const query = parseQuery(ui.commandRest);
    this.query = query;
    if (!query.text || this.loading) return false;
    if (this.result && this.done && sameQuery(this.done, query)) {
      return this.copy();
    }
    return this.run(query);
  }

  async run(query: TranslateQuery): Promise<boolean> {
    const seq = ++this.seq;
    this.loading = true;
    this.error = null;
    try {
      const next = await invoke<TranslateResponse>("translate", {
        text: query.text,
        source: query.source,
        target: query.target,
      });
      if (seq !== this.seq) return false;
      this.result = {
        ...next,
        tags: next.tags ?? [],
        forms: next.forms ?? [],
        similar: next.similar ?? [],
        parts: next.parts ?? [],
        sentences: next.sentences ?? [],
      };
      this.done = query;
      this.error = null;
      this.loading = false;
      return true;
    } catch (err) {
      if (seq !== this.seq) return false;
      this.result = null;
      this.done = null;
      this.error = invokeError(err);
      this.loading = false;
      return false;
    }
  }

  swap(): boolean {
    const current = this.result;
    if (!current || this.loading) return false;
    const text = this.query.text;
    if (!text) return false;
    ui.searchText = `tr ${current.to} ${current.from} ${text}`;
    ui.focusField = "search";
    return true;
  }

  async copy(): Promise<boolean> {
    if (this.loading) return false;
    const text = this.result?.translatedText.trim();
    if (!text) return false;
    const ok = await writeClipboardText(text);
    if (!ok) {
      ui.flash(i18n.t("copy.failed"));
      return false;
    }
    ui.beginHide({ reset: true });
    return true;
  }
}

export const translate = new TranslateStore();

function parseQuery(rest: string): TranslateQuery {
  return parseTranslateInput(rest, {
    defaultTarget: settings.translateDefaultTarget,
    secondTarget: settings.translateSecondTarget,
  });
}

function sameQuery(a: TranslateQuery, b: TranslateQuery): boolean {
  return a.text === b.text && a.source === b.source && a.target === b.target;
}

function invokeError(err: unknown): string {
  if (typeof err === "string" && err.trim()) return err.trim();
  if (err && typeof err === "object" && "message" in err) {
    const message = (err as { message: unknown }).message;
    if (typeof message === "string" && message.trim()) return message.trim();
  }
  return "unknown";
}
