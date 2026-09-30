/** What `translate` returns. `from`/`to` are the codes the service actually used. */
export type Translation = {
  text: string;
  from: string;
  to: string;
};

/**
 * One slice of the AI answer, from the `translate-llm-delta` event.
 *
 * `stream` is the id the store gave its own call. A superseded call keeps
 * streaming for seconds after the store stopped waiting for it, so a delta is
 * only worth appending when it names the call that is still on screen.
 */
export type LlmDelta = {
  stream: string;
  delta: string;
};

/** One sense of a word. `partOfSpeech` is empty when the dictionary gave none. */
export type WordDefinition = {
  partOfSpeech: string;
  meaning: string;
};

/** One inflected form, e.g. `{ name: "复数", value: "hellos" }`. */
export type WordForm = {
  name: string;
  value: string;
};

export type WordExample = {
  en: string;
  zh: string;
};

/**
 * A dictionary entry. `lookup_word` returning null — not an error — is how the
 * panel knows the text is a sentence and has no card to render.
 */
export type WordEntry = {
  headword: string;
  usPhone: string | null;
  ukPhone: string | null;
  hasUsAudio: boolean;
  hasUkAudio: boolean;
  definitions: WordDefinition[];
  forms: WordForm[];
  examples: WordExample[];
};
