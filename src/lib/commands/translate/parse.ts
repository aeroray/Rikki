import { i18n } from "$lib/i18n";
import type { Locale } from "$lib/i18n/locale";
import type { MessageKey } from "$lib/i18n/zh-CN";

/**
 * The target languages Tab cycles through, ordered by likely use rather than by
 * locale: the two languages the interface itself is written in come first, then
 * the rest. `labelKey` is an i18n key so the order stays independent of the
 * language on screen.
 *
 * These are Sogou codes. The service writes Chinese as `zh-CHS` — plain `zh` is
 * rejected — and it does not accept `auto` for the source, which is why the
 * source is always guessed below rather than asked for.
 *
 * `short` is the language's own name, which is why it is a literal rather than
 * an i18n key: a language list is conventionally written in the languages
 * themselves, so "日本語" needs no translation into either interface language,
 * and the abbreviations keep the whole list inside the footer.
 */
export const SUPPORTED_TARGETS: ReadonlyArray<{
  code: string;
  labelKey: MessageKey;
  short: string;
}> = [
  { code: "zh-CHS", labelKey: "translate.language.zh", short: "中文" },
  { code: "en", labelKey: "translate.language.en", short: "EN" },
  { code: "ja", labelKey: "translate.language.ja", short: "日本語" },
  { code: "ko", labelKey: "translate.language.ko", short: "한국어" },
];

/** The target the interface language itself translates into. */
export function uiLanguageCode(locale: Locale = i18n.locale): string {
  return locale === "zh-CN" ? "zh-CHS" : "en";
}

/** The label for a target, or null when it is not one the panel offers. */
export function targetLabelKey(code: string): MessageKey | null {
  return SUPPORTED_TARGETS.find((target) => target.code === code)?.labelKey ?? null;
}

/**
 * Which language the text is in.
 *
 * The service will not detect it, so this is the only thing between a request
 * and an error. Script is enough for the languages that have a distinctive one;
 * everything else — French, German, a lone digit — is treated as English, which
 * is the harmless guess because it is the language most text is written in.
 */
export function guessSourceLang(text: string): string {
  if (/[\u3040-\u30ff]/.test(text)) return "ja";
  if (/[\uac00-\ud7af]/.test(text)) return "ko";
  if (/[\u0e00-\u0e7f]/.test(text)) return "th";
  if (/[\u0400-\u04ff]/.test(text)) return "ru";
  if (/[\u4e00-\u9fff]/.test(text)) return "zh-CHS";
  return "en";
}

/**
 * The language to translate into.
 *
 * `preferred` is what the user last chose, or the interface language while they
 * have not chosen at all. Translating a language into itself echoes the input
 * back, so when the preference collides with the source the interface language
 * takes over: typing English with the target on Chinese gives Chinese, typing
 * Chinese gives English, and neither cost a trip to a settings screen.
 */
export function resolveTarget(source: string, preferred: string, uiLanguage: string): string {
  const target = preferred && preferred !== source ? preferred : uiLanguage;
  // The interface language can collide with the source as well — a Chinese
  // interface, Chinese input, and Chinese as the remembered target — and that
  // pair would return the text untouched. English is the one target that always
  // moves, so it is the fallback even when the interface is Chinese.
  if (target === source) return source === "en" ? "zh-CHS" : "en";
  return target;
}

/** Longest text still worth asking the dictionary about. */
const MAX_WORD_LENGTH = 32;

/**
 * Whether to try the dictionary at all.
 *
 * An entry is keyed by a single word, so anything with whitespace — or long
 * enough to be a phrase however it is spaced — goes straight to the translator.
 * This is the only thing that decides: the dictionary returning nothing is what
 * says "sentence", and a word it happens not to know is translated like one.
 */
export function isWordLike(text: string): boolean {
  const trimmed = text.trim();
  return trimmed.length > 0 && trimmed.length <= MAX_WORD_LENGTH && !/\s/.test(trimmed);
}
