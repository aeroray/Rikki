import { invoke } from "@tauri-apps/api/core";
import { writeText } from "tauri-plugin-clipboard-x-api";
import { parseTranslateInput, type TranslateQuery } from "$lib/commands/translate/parse";
import type { TranslateResponse } from "$lib/commands/translate/types";
import { clipboard } from "$lib/stores/clipboard.svelte";
import { settings } from "$lib/stores/settings.svelte";
import { ui } from "$lib/stores/ui.svelte";

const DEBOUNCE_MS = 400;

class TranslateStore {
  result = $state<TranslateResponse | null>(null);
  query = $state<TranslateQuery>({ source: "auto", target: "zh", text: "" });
  loading = $state(false);
  error = $state<string | null>(null);
  private timer: ReturnType<typeof setTimeout> | null = null;
  private seq = 0;

  readonly wordMode = $derived(Boolean(this.result?.hasDict));

  schedule(rest: string) {
    const query = parseTranslateInput(rest, {
      defaultTarget: settings.translateDefaultTarget,
      secondTarget: settings.translateSecondTarget,
    });
    this.query = query;
    if (this.timer) clearTimeout(this.timer);
    if (!query.text) {
      this.seq += 1;
      this.loading = false;
      this.result = null;
      this.error = null;
      return;
    }
    this.loading = true;
    this.error = null;
    this.timer = setTimeout(() => {
      this.timer = null;
      void this.run(query);
    }, DEBOUNCE_MS);
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
      this.result = next;
      this.error = null;
      this.loading = false;
      return true;
    } catch (err) {
      if (seq !== this.seq) return false;
      this.result = null;
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
    try {
      clipboard.suppressNextCapture();
      try {
        await writeText(text);
      } catch (err) {
        clipboard.suppressNextCapture(false);
        throw err;
      }
      ui.beginHide();
      return true;
    } catch {
      return false;
    }
  }
}

export const translate = new TranslateStore();

function invokeError(err: unknown): string {
  if (typeof err === "string" && err.trim()) return err.trim();
  if (err && typeof err === "object" && "message" in err) {
    const message = (err as { message: unknown }).message;
    if (typeof message === "string" && message.trim()) return message.trim();
  }
  return "unknown";
}
