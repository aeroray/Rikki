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

  /**
   * The LLM's translation, kept apart from the machine one on purpose.
   *
   * It arrives seconds later, and the anonymous tier answers 402 once a request
   * has gone out in the last 15 seconds, so it is expected to fail sometimes.
   * Nothing here may clear, block or fail what is already on screen.
   */
  llmText = $state<string | null>(null);
  llmLoading = $state(false);
  llmError = $state<string | null>(null);

  /**
   * Whether the LLM refused because of its rate limit rather than for a real
   * reason. The backend reports that case as "llm busy" precisely so it can be
   * told apart and worded as "try again shortly" instead of a failure.
   */
  readonly llmBusy = $derived(/busy/i.test(this.llmError ?? ""));

  private seq = 0;
  private done: Query | null = null;
  private inflight: Query | null = null;
  private audio: HTMLAudioElement | null = null;
  private audioSeq = 0;
  /** The last dictionary answer, and the text it describes. */
  private entryCache: { text: string; value: WordEntry | null } | null = null;
  private entryInflight: { text: string; promise: Promise<WordEntry | null> } | null = null;
  private targetTimer: ReturnType<typeof setTimeout> | null = null;

  /** What the text on screen would be sent as, before anything is requested. */
  readonly query = $derived(this.resolve(ui.commandRest.trim()));

  readonly targetName = $derived.by(() => {
    const key = targetLabelKey(this.query.target);
    return key ? i18n.t(key) : this.query.target;
  });

  /**
   * Whether the text on screen has an LLM half at all.
   *
   * Words never do — the dictionary card is the better answer, and the rate
   * limit is one request per 15 seconds — and neither does a word the dictionary
   * did not know, which falls back to the sentence shape. The panel and the
   * footer both read this so they agree on which shape is on screen.
   */
  readonly llmApplies = $derived(!isWordLike(this.query.text));

  /**
   * How long the target has to hold still before the text is re-translated.
   * Long enough to cover a run of Tab presses, short enough to feel immediate.
   */
  private static readonly SETTLE_MS = 250;

  constructor() {
    // A clip still playing after the palette hides has no visible owner and no
    // way left to stop it.
    ui.onHideFlush(() => {
      this.stopAudio();
      this.cancelScheduledRun();
    });
  }

  /**
   * The dictionary answer for a text, fetched at most once.
   *
   * It does not depend on the target language, so re-running the translation to
   * change the target used to re-fetch the same word: translating a word and
   * pressing Tab twice made three dictionary requests for one word, two of them
   * thrown away on arrival.
   */
  private lookup(text: string): Promise<WordEntry | null> {
    if (!isWordLike(text)) return Promise.resolve(null);
    if (this.entryCache?.text === text) return Promise.resolve(this.entryCache.value);
    const pending = this.entryInflight;
    if (pending && pending.text === text) return pending.promise;
    const promise = invoke<WordEntry | null>("lookup_word", { text })
      // A missing word card is not a failed translation, so a dictionary error
      // degrades to the sentence shape rather than failing the request.
      .catch(() => null)
      .then((value) => {
        if (this.entryInflight?.promise === promise) this.entryInflight = null;
        this.entryCache = { text, value };
        return value;
      });
    this.entryInflight = { text, promise };
    return promise;
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
    // Everything in flight describes text that is no longer on screen, and the
    // sequence guard drops it when it lands. The LLM call outlives the machine
    // one by seconds, so this bump is what keeps it from landing afterwards.
    this.seq += 1;
    this.inflight = null;
    this.loading = false;
    this.result = null;
    this.error = null;
    this.done = null;
    this.clearLlm();
    // A run scheduled by a target change describes the text that was just
    // replaced, so it must not land.
    this.cancelScheduledRun();
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
    this.clearLlm();
    this.stopAudio();
    // Started here rather than after the machine answer: the two are
    // independent, and awaiting this one would make the fast answer wait for
    // the slow one — which is the whole reason there are two.
    void this.runLlm(query, seq);
    const entry = this.lookup(query.text);
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
   * The LLM translation, in flight beside the machine one.
   *
   * `seq` is the sequence number of the run that asked for it, not a counter of
   * its own: this call outlives the machine call by seconds, which is exactly
   * the window in which the text or the target can change, so it has to be
   * dropped by the same guard.
   */
  private async runLlm(query: Query, seq: number): Promise<void> {
    // A single word keeps the dictionary card and never reaches the LLM; this
    // is the same rule `llmApplies` reports to the panel.
    if (!this.llmApplies) return;
    this.llmLoading = true;
    this.llmError = null;
    this.llmText = null;
    try {
      const answer = (
        await invoke<string>("translate_llm", {
          text: query.text,
          from: query.source,
          to: query.target,
        })
      ).trim();
      if (this.stale(query, seq)) return;
      if (answer) {
        this.llmText = answer;
      } else {
        // A blank answer would leave the section labelled and empty, which
        // reads as a rendering bug rather than as a call that came back with
        // nothing.
        this.llmError = "llm returned nothing";
      }
    } catch (err) {
      if (this.stale(query, seq)) return;
      this.llmError = message(err);
    } finally {
      // A superseded run leaves the flag to the run that replaced it.
      if (!this.stale(query, seq)) this.llmLoading = false;
    }
  }

  /**
   * Whether a response has been overtaken.
   *
   * The sequence number alone is not enough for the LLM. Its answer can land
   * inside the quarter second a Tab press waits for the target to stop moving —
   * after the new target is chosen, before `run` has bumped the sequence — and
   * showing the previous language's translation under the new target is exactly
   * the surprise the footer is written to avoid.
   */
  private stale(query: Query, seq: number): boolean {
    return seq !== this.seq || !sameQuery(query, this.query);
  }

  /** Drops the LLM half. The machine translation is left exactly as it is. */
  private clearLlm() {
    this.llmText = null;
    this.llmError = null;
    this.llmLoading = false;
  }

  /**
   * Asks the LLM again for the text already on screen.
   *
   * Without this the rate limit would be a dead end: once a translation is up,
   * Enter copies instead of re-running, and going through Tab would spend the
   * machine request again for an answer that is already correct.
   */
  async retryLlm(): Promise<void> {
    const query = this.done;
    // Not while one is already in flight, and not for text that has moved on
    // since the error was drawn — the request is rate limited, so it is worth
    // not spending one on an answer that would be dropped on arrival.
    if (this.llmLoading || !query || !sameQuery(query, this.query)) return;
    await this.runLlm(query, this.seq);
  }

  /**
   * Tab and Shift+Tab, routed here by the palette's central key handler.
   *
   * The choice is persisted, which is why the store owns this rather than the
   * panel. Nothing is requested until the target stops moving — see
   * `scheduleRun`.
   */
  async cycleTarget(backwards = false): Promise<void> {
    const current = this.query.target;
    const index = SUPPORTED_TARGETS.findIndex((target) => target.code === current);
    const step = backwards ? -1 : 1;
    const next = SUPPORTED_TARGETS[
      (index + step + SUPPORTED_TARGETS.length) % SUPPORTED_TARGETS.length
    ];
    if (!next) return;
    if (!(await settings.setTranslateTarget(next.code))) return;
    this.scheduleRun();
  }

  /** Picking a language from the footer's list, rather than stepping to it. */
  async setTarget(code: string): Promise<void> {
    if (code === this.query.target) return;
    if (!(await settings.setTranslateTarget(code))) return;
    this.scheduleRun();
  }

  /**
   * Re-translates once the target stops moving.
   *
   * Pressing Tab four times to reach Japanese used to fire four translations,
   * three of them discarded on arrival — wasteful, and enough to trip a rate
   * limit. The footer updates on every press; only the last one is requested.
   * The dictionary is not re-fetched either way, because it does not depend on
   * the target.
   */
  private scheduleRun() {
    this.cancelScheduledRun();
    this.targetTimer = setTimeout(() => {
      this.targetTimer = null;
      const query = this.query;
      if (query.text) void this.run(query);
    }, TranslateStore.SETTLE_MS);
  }

  private cancelScheduledRun() {
    if (!this.targetTimer) return;
    clearTimeout(this.targetTimer);
    this.targetTimer = null;
  }

  /**
   * Enter: the LLM answer once it is ready, the machine one until then.
   *
   * The footer chip names which of the two this will take, so the switch from
   * one to the other is never silent.
   */
  async copy(): Promise<boolean> {
    if (this.loading) return false;
    return this.copyText(this.llmText ?? this.result?.translation.text);
  }

  /** Ctrl+1: the machine translation, by name. */
  async copyMachine(): Promise<boolean> {
    if (this.loading) return false;
    return this.copyText(this.result?.translation.text);
  }

  /** Ctrl+2: the LLM translation, by name. */
  async copyLlm(): Promise<boolean> {
    return this.copyText(this.llmText);
  }

  private async copyText(text: string | null | undefined): Promise<boolean> {
    const value = text?.trim();
    if (!value) return false;
    const ok = await writeClipboardText(value);
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
