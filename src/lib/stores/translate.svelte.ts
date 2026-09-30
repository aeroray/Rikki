import { writeClipboardText } from "$lib/clipboard/write";
import {
  SUPPORTED_TARGETS,
  guessSourceLang,
  isWordLike,
  resolveTarget,
  targetLabelKey,
  uiLanguageCode,
} from "$lib/commands/translate/parse";
import type { Translation, WordEntry } from "$lib/commands/translate/types";
import { i18n } from "$lib/i18n";
import { settings } from "$lib/stores/settings.svelte";
import { ui } from "$lib/stores/ui.svelte";
import { invoke } from "@tauri-apps/api/core";

export type Accent = "us" | "uk";

/** One finished request: the translation, plus the word card when there is one. */
export type TranslateResult = {
  translation: Translation;
  entry: WordEntry | null;
};

/** The request a result belongs to. A result is only shown for its own query. */
type Query = {
  text: string;
  source: string;
  target: string;
};

class TranslateStore {
  result = $state<TranslateResult | null>(null);
  loading = $state(false);
  /** The backend's own message, shown under a mapped title. Empty means it said nothing useful. */
  error = $state<string | null>(null);

  private seq = 0;
  private done: Query | null = null;
  private inflight: Query | null = null;
  private audio: HTMLAudioElement | null = null;
  private audioSeq = 0;

  /** What the text on screen would be sent as, before anything is requested. */
  readonly query = $derived(this.resolve(ui.commandRest.trim()));

  readonly targetName = $derived.by(() => {
    const key = targetLabelKey(this.query.target);
    return key ? i18n.t(key) : this.query.target;
  });

  /**
   * Read by the palette's central Tab handler in `routes/+page.svelte` before
   * it calls `swap()`. That guard predates this panel having two shapes: Tab
   * now moves the target language, which is worth offering in every state —
   * including before anything is typed, since the choice is remembered.
   */
  readonly wordMode = true;

  constructor() {
    // A clip still playing after the palette hides has no visible owner and no
    // way left to stop it.
    ui.onHideFlush(() => this.stopAudio());
  }

  private resolve(text: string): Query {
    const uiLanguage = uiLanguageCode();
    const preferred = settings.translateTarget || uiLanguage;
    // With nothing typed there is no language to collide with, and the footer
    // should report what the user chose rather than a fallback computed from a
    // guess that was never made.
    if (!text) return { text, source: uiLanguage, target: preferred };
    const source = guessSourceLang(text);
    return { text, source, target: resolveTarget(source, preferred, uiLanguage) };
  }

  /**
   * Drops a result that no longer describes what is typed. The panel calls this
   * as the query changes, so editing the text never leaves the previous
   * translation on screen beside the new input.
   */
  sync(rest: string) {
    const text = rest.trim();
    if (text === this.done?.text || text === this.inflight?.text) return;
    if (this.inflight) {
      // The response is already stale; the sequence guard drops it when it lands.
      this.seq += 1;
      this.inflight = null;
      this.loading = false;
    }
    this.result = null;
    this.error = null;
    this.done = null;
  }

  /** Enter: copies a finished translation, and otherwise starts one. */
  async submit(): Promise<boolean> {
    const query = this.query;
    if (!query.text || this.loading) return false;
    if (this.result && this.done && sameQuery(this.done, query)) return this.copy();
    return this.run(query);
  }

  async run(query: Query = this.query): Promise<boolean> {
    if (!query.text) return false;
    const seq = ++this.seq;
    this.inflight = query;
    this.loading = true;
    this.error = null;
    this.result = null;
    this.stopAudio();
    // The dictionary is a bonus on top of the translation, not a prerequisite:
    // letting it fail here would turn a missing word card into a failed request.
    const entry = isWordLike(query.text)
      ? invoke<WordEntry | null>("lookup_word", { text: query.text }).catch(() => null)
      : Promise.resolve(null);
    try {
      const [word, translation] = await Promise.all([
        entry,
        invoke<Translation>("translate", {
          text: query.text,
          from: query.source,
          to: query.target,
        }),
      ]);
      if (seq !== this.seq) return false;
      this.result = { translation, entry: word };
      this.done = query;
      this.inflight = null;
      this.loading = false;
      return true;
    } catch (err) {
      if (seq !== this.seq) return false;
      this.result = null;
      this.done = null;
      this.inflight = null;
      this.error = message(err);
      this.loading = false;
      return false;
    }
  }

  /**
   * Tab, routed here by the palette's central key handler.
   *
   * The handler still calls `swap()` because it predates this panel, where Tab
   * swapped the translation direction. It now moves to the next target
   * language, and the store owns it because the choice has to be persisted.
   */
  swap(): void {
    void this.cycleTarget();
  }

  async cycleTarget(): Promise<void> {
    const current = this.query.target;
    const index = SUPPORTED_TARGETS.findIndex((target) => target.code === current);
    const next = SUPPORTED_TARGETS[(index + 1) % SUPPORTED_TARGETS.length];
    if (!next) return;
    if (!(await settings.setTranslateTarget(next.code))) return;
    // Re-read rather than reusing `current`: the target just changed, and
    // translating the old one would leave the result disagreeing with the
    // footer, which reports the new one.
    const query = this.query;
    if (query.text) await this.run(query);
  }

  async copy(): Promise<boolean> {
    if (this.loading) return false;
    const text = this.result?.translation.text.trim();
    if (!text) return false;
    const ok = await writeClipboardText(text);
    if (!ok) {
      ui.flash(i18n.t("copy.failed"));
      return false;
    }
    ui.beginHide({ reset: true });
    return true;
  }

  /** Whether an accent has a clip, so the panel only offers keys that work. */
  hasAudio(accent: Accent): boolean {
    const entry = this.result?.entry;
    if (!entry) return false;
    return accent === "us" ? entry.hasUsAudio : entry.hasUkAudio;
  }

  async play(accent: Accent): Promise<void> {
    const entry = this.result?.entry;
    if (!entry || !this.hasAudio(accent)) return;
    const seq = ++this.audioSeq;
    try {
      const base64 = await invoke<string>("pronounce", { text: entry.headword, accent });
      // A newer clip, or a stop, supersedes this one while it was in flight.
      if (seq !== this.audioSeq) return;
      this.stopAudio();
      const audio = new Audio(`data:audio/mpeg;base64,${base64}`);
      this.audio = audio;
      audio.addEventListener("ended", () => this.release(audio));
      audio.addEventListener("error", () => this.release(audio));
      await audio.play();
    } catch {
      // A clip that will not play is not worth an error state: the card the
      // user was reading stays exactly where it is.
      ui.flash(i18n.t("translate.audioFailed"));
    }
  }

  stopAudio() {
    this.audioSeq += 1;
    const audio = this.audio;
    this.audio = null;
    if (!audio) return;
    audio.pause();
    // Dropping the source releases the decoded clip instead of holding a whole
    // data URL for as long as the palette lives.
    audio.removeAttribute("src");
  }

  private release(audio: HTMLAudioElement) {
    if (this.audio === audio) this.audio = null;
  }
}

export const translate = new TranslateStore();

function sameQuery(a: Query, b: Query): boolean {
  return a.text === b.text && a.source === b.source && a.target === b.target;
}

function message(err: unknown): string {
  if (typeof err === "string") return err.trim();
  if (err && typeof err === "object" && "message" in err) {
    const value = (err as { message: unknown }).message;
    if (typeof value === "string") return value.trim();
  }
  return "";
}
