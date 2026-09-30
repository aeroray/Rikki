import { writeClipboardText } from "$lib/clipboard/write";
import {
  SUPPORTED_TARGETS,
  guessSourceLang,
  isWordLike,
  resolveTarget,
  targetLabelKey,
  uiLanguageCode,
} from "$lib/commands/translate/parse";
import type { LlmDelta, Translation, WordEntry } from "$lib/commands/translate/types";
import { i18n } from "$lib/i18n";
import { settings } from "$lib/stores/settings.svelte";
import { ui } from "$lib/stores/ui.svelte";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";

/**
 * The event `translate_llm` emits each slice of its answer on.
 *
 * The command also returns the whole answer, and that is what the store ends up
 * showing; the deltas only exist so the text grows while the call is still
 * running instead of appearing all at once when it finishes.
 */
const LLM_DELTA = "translate-llm-delta";

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
   * The AI translation, kept apart from the fast one on purpose.
   *
   * It arrives seconds later, and it is allowed to fail — the endpoint has an
   * anonymous quota and no second service stands behind it — so it is expected
   * to come back unavailable sometimes. Nothing here may clear, block or fail
   * what is already on screen.
   *
   * It grows while the call runs, one delta at a time, and the command's return
   * value replaces it at the end.
   */
  llmText = $state<string | null>(null);
  llmLoading = $state(false);
  llmError = $state<string | null>(null);

  /**
   * Whether the AI answer is whole.
   *
   * `llmText` is non-null from the first delta onwards, so it alone cannot say
   * whether what is on screen is the translation or the first three words of it.
   * Copying has to wait for the end: a prefix of a sentence is worse than the
   * fast translation that is already complete beside it.
   */
  readonly llmReady = $derived(this.llmText !== null && !this.llmLoading);

  private seq = 0;
  private done: Query | null = null;
  private inflight: Query | null = null;
  private audio: HTMLAudioElement | null = null;
  private audioSeq = 0;
  /**
   * The one stream whose deltas belong on screen.
   *
   * A superseded call keeps streaming for seconds after it was replaced, and
   * its deltas arrive on the same event as the current call's. Matching on this
   * id is what keeps the old answer from being appended to the new one; it is
   * cleared whenever the LLM half is, so a stream nothing is waiting for cannot
   * paint either.
   */
  private llmStream: string | null = null;
  private llmStreams = 0;
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
   * Whether the text on screen has an AI half at all.
   *
   * Words never do — the dictionary card is the better answer, and the model
   * has nothing to add to a single word — and neither does a word the dictionary
   * did not know, which falls back to the sentence shape. The panel and the
   * footer both read this so they agree on which shape is on screen.
   */
  readonly llmApplies = $derived(this.result !== null && this.result.entry === null);

  /**
   * The clip the panel's one sentence control would ask for, or null.
   *
   * A sentence has no US/UK pair, so unlike a word card it has exactly one
   * speaker — and unlike a word card it has nothing to say when the target is a
   * language the voice endpoint was not measured to answer for, which is why
   * this is null rather than a button that fails when it is pressed.
   *
   * The language is the one the service reported for the translation rather than
   * the one that was asked for: `to` is the language the text on screen is
   * actually in, and therefore the language the clip would be read in. The
   * endpoint is measured for every target the panel offers, so the check is the
   * panel's own list rather than a second one that could drift from it.
   */
  /**
   * A clip worth asking for, or null when there is not one.
   *
   * The language is the one the service reported for the translation rather than
   * the one that was asked for: `to` is the language the text on screen is
   * actually in, and therefore the language the clip would be read in. The
   * endpoint is measured for every target the panel offers, so the check is the
   * panel's own list rather than a second one that could drift from it.
   */
  private voiceFor(text: string | null | undefined): { text: string; lang: string } | null {
    const trimmed = text?.trim();
    const lang = this.result?.translation.to;
    if (!trimmed || !lang) return null;
    if (!SUPPORTED_TARGETS.some((target) => target.code === lang)) return null;
    return { text: trimmed, lang };
  }

  readonly sentenceVoice = $derived(
    this.result && !this.result.entry ? this.voiceFor(this.result.translation.text) : null,
  );

  /** The advanced answer. Same language as the standard one, and read the same way. */
  readonly llmVoice = $derived(this.voiceFor(this.llmText));

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
    // One listener for the life of the app rather than one per call: a stream
    // outlives the call that asked for it, so the listener has to outlive it
    // too, and `llmStream` is what decides whether a delta belongs on screen.
    void listen<LlmDelta>(LLM_DELTA, (event) => {
      this.appendLlmDelta(event.payload);
    }).catch(() => {});
  }

  private appendLlmDelta(payload: LlmDelta) {
    if (payload.stream !== this.llmStream) return;
    this.llmText = (this.llmText ?? "") + payload.delta;
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
  async submit(standard = false): Promise<boolean> {
    const query = this.query;
    if (!query.text || this.loading) return false;
    if (this.result && this.done && sameQuery(this.done, query)) {
      // Enter takes the slow answer once it exists, because that is the one worth
      // having; Shift is the way back to the fast one. Naming the target in the
      // footer is what keeps that from being a surprise.
      return standard ? this.copyMachine() : this.copy();
    }
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
    const entry = this.lookup(query.text);
    // The model is asked only once the dictionary has settled what this is, and
    // only when it found nothing — a dictionary beats a model at a single word,
    // and asking in parallel would spend an AI request on every word lookup. The
    // wait is a few hundred milliseconds against a call that takes seconds.
    void entry.then((word) => {
      if (seq !== this.seq || word !== null) return;
      void this.runLlm(query, seq);
    });
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
   * The AI translation, in flight beside the fast one.
   *
   * `seq` is the sequence number of the run that asked for it, not a counter of
   * its own: this call outlives the fast call by seconds, which is exactly the
   * window in which the text or the target can change, so it has to be dropped
   * by the same guard. `stream` is the second half of that guard — see
   * `llmStream`.
   */
  private async runLlm(query: Query, seq: number): Promise<void> {
    const stream = String(++this.llmStreams);
    this.llmStream = stream;
    this.llmLoading = true;
    this.llmError = null;
    this.llmText = null;
    try {
      const answer = (
        await invoke<string>("translate_llm", {
          stream,
          text: query.text,
          from: query.source,
          to: query.target,
        })
      ).trim();
      if (this.stale(query, seq)) return;
      if (answer) {
        // The command's answer is the whole translation, so it replaces
        // whatever the deltas built up rather than being appended to them.
        this.llmText = answer;
      } else {
        // A blank answer would leave the section labelled and empty, which
        // reads as a rendering bug rather than as a call that came back with
        // nothing.
        this.llmText = null;
        this.llmError = "llm returned nothing";
      }
    } catch (err) {
      if (this.stale(query, seq)) return;
      this.llmText = null;
      this.llmError = message(err);
    } finally {
      // A superseded run leaves the flag to the run that replaced it, and the
      // stream id to whichever call owns it now.
      if (this.llmStream === stream) this.llmStream = null;
      if (!this.stale(query, seq)) this.llmLoading = false;
    }
  }

  /**
   * Whether a response has been overtaken.
   *
   * The sequence number alone is not enough for the AI call. Its answer can land
   * inside the quarter second a Tab press waits for the target to stop moving —
   * after the new target is chosen, before `run` has bumped the sequence — and
   * showing the previous language's translation under the new target is exactly
   * the surprise the footer is written to avoid.
   */
  private stale(query: Query, seq: number): boolean {
    return seq !== this.seq || !sameQuery(query, this.query);
  }

  /** Drops the AI half. The fast translation is left exactly as it is. */
  private clearLlm() {
    this.llmText = null;
    this.llmError = null;
    this.llmLoading = false;
    // Anything still streaming belongs to a call nothing is waiting for, so its
    // deltas must not be able to paint over whatever comes next.
    this.llmStream = null;
  }

  /**
   * Asks the AI endpoint again for the text already on screen.
   *
   * Worth keeping even though nothing here is rate limited by the second: the
   * endpoint answers with a quota error when the anonymous allowance runs out,
   * and a dropped connection fails the same way a real refusal does. Neither is
   * a reason to make the user retype the sentence — the text is still on screen,
   * so retrying is one click. It is not offered while a call is already in
   * flight, and not for text that has moved on since the error was drawn.
   */
  async retryLlm(): Promise<void> {
    const query = this.done;
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
   * Enter: the AI answer once it is whole, the fast one until then.
   *
   * The footer chip names which of the two this will take, so the switch from
   * one to the other is never silent.
   */
  async copy(): Promise<boolean> {
    if (this.loading) return false;
    return this.copyText(this.llmReady ? this.llmText : this.result?.translation.text);
  }

  /** Ctrl+1: the fast translation, by name. */
  async copyMachine(): Promise<boolean> {
    if (this.loading) return false;
    return this.copyText(this.result?.translation.text);
  }

  /** Ctrl+2: the AI translation, by name. Nothing until it is whole. */
  async copyLlm(): Promise<boolean> {
    if (!this.llmReady) return false;
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
      await this.playClip(base64);
    } catch {
      // A clip that will not play is not worth an error state: the card the
      // user was reading stays exactly where it is.
      ui.flash(i18n.t("translate.audioFailed"));
    }
  }

  /**
   * Reads the sentence translation aloud.
   *
   * The counterpart of `play` for a shape that has no accents: one clip, in the
   * language the translation came back in, and the same single `Audio` element
   * underneath so a sentence and a word can never play over each other. It is
   * reached only through `sentenceVoice`, which is also what the panel uses to
   * decide whether to draw the button at all.
   */
  async playSentence(advanced = false): Promise<void> {
    const voice = advanced ? this.llmVoice : this.sentenceVoice;
    if (!voice) return;
    const seq = ++this.audioSeq;
    try {
      const base64 = await invoke<string>("pronounce_sentence", {
        text: voice.text,
        lang: voice.lang,
      });
      if (seq !== this.audioSeq) return;
      await this.playClip(base64);
    } catch {
      ui.flash(i18n.t("translate.audioFailed"));
    }
  }

  /**
   * Plays one base64 clip, replacing whatever is playing.
   *
   * Both speakers go through here so that they share the one `Audio` element the
   * store keeps: two clips must never overlap, whichever control asked for them.
   */
  private async playClip(base64: string): Promise<void> {
    this.stopAudio();
    const audio = new Audio(`data:audio/mpeg;base64,${base64}`);
    this.audio = audio;
    audio.addEventListener("ended", () => this.release(audio));
    audio.addEventListener("error", () => this.release(audio));
    await audio.play();
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
