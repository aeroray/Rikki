import { i18n } from "$lib/i18n";
import type { Locale } from "$lib/i18n/locale";
import type { MessageKey } from "$lib/i18n/zh-CN";

export const LANG_CODES = ["zh", "en", "ja", "ko", "fr", "de", "es", "ru", "th", "vi", "auto"] as const;

export type LangCode = (typeof LANG_CODES)[number];

export const TARGET_LANG_CODES = ["zh", "en", "ja", "ko", "fr", "de", "es", "ru", "th", "vi"] as const;

export type TargetLangCode = (typeof TARGET_LANG_CODES)[number];

export type TranslateQuery = {
  source: LangCode;
  target: LangCode;
  text: string;
};

export type TranslateTargets = {
  defaultTarget: TargetLangCode;
  secondTarget: TargetLangCode;
};

const ALIASES: Record<string, LangCode> = {
  zh: "zh",
  "zh-cn": "zh",
  en: "en",
  ja: "ja",
  jp: "ja",
  ko: "ko",
  kor: "ko",
  fr: "fr",
  fra: "fr",
  de: "de",
  es: "es",
  spa: "es",
  ru: "ru",
  th: "th",
  vi: "vi",
  vie: "vi",
  auto: "auto",
};

const LANG_KEYS: Record<TargetLangCode, MessageKey> = {
  zh: "translate.language.zh",
  en: "translate.language.en",
  ja: "translate.language.ja",
  ko: "translate.language.ko",
  fr: "translate.language.fr",
  de: "translate.language.de",
  es: "translate.language.es",
  ru: "translate.language.ru",
  th: "translate.language.th",
  vi: "translate.language.vi",
};

export function parseLangCode(token: string): LangCode | null {
  return ALIASES[token.trim().toLowerCase()] ?? null;
}

export function parseTargetLangCode(token: string | undefined | null): TargetLangCode | null {
  const code = parseLangCode(token ?? "");
  if (!code || code === "auto") return null;
  return code;
}

export function preferredTranslateLang(locale: Locale = i18n.locale): TargetLangCode {
  return locale === "zh-CN" ? "zh" : "en";
}

export function translateLangKey(code: TargetLangCode): MessageKey {
  return LANG_KEYS[code];
}

export function guessSourceLang(text: string): TargetLangCode | null {
  if (/[\u3040-\u30ff]/.test(text)) return "ja";
  if (/[\uac00-\ud7af]/.test(text)) return "ko";
  if (/[\u0e00-\u0e7f]/.test(text)) return "th";
  if (/[\u0400-\u04ff]/.test(text)) return "ru";
  if (/[\u4e00-\u9fff]/.test(text)) return "zh";
  if (/[A-Za-zÀ-ÿ]/.test(text)) return "en";
  return null;
}

export function autoTranslateTarget(text: string, targets: TranslateTargets): TargetLangCode {
  const source = guessSourceLang(text);
  if (source && source === targets.defaultTarget) return targets.secondTarget;
  return targets.defaultTarget;
}

export function parseTranslateInput(rest: string, targets?: TranslateTargets): TranslateQuery {
  const resolved: TranslateTargets = {
    defaultTarget: targets?.defaultTarget ?? preferredTranslateLang(),
    secondTarget: targets?.secondTarget ?? "en",
  };
  const trimmed = rest.trim();
  if (!trimmed) {
    return { source: "auto", target: resolved.defaultTarget, text: "" };
  }

  const parts = trimmed.split(/\s+/);
  const first = parseLangCode(parts[0] ?? "");
  const firstTarget = parseTargetLangCode(parts[0] ?? "");
  const secondTarget = parseTargetLangCode(parts[1] ?? "");

  if (parts.length >= 3 && first && secondTarget) {
    return {
      source: first,
      target: secondTarget,
      text: trimmed.replace(/^\S+\s+\S+\s+/, ""),
    };
  }

  if (parts.length >= 2 && firstTarget) {
    return {
      source: "auto",
      target: firstTarget,
      text: trimmed.replace(/^\S+\s+/, ""),
    };
  }

  return {
    source: "auto",
    target: autoTranslateTarget(trimmed, resolved),
    text: trimmed,
  };
}

export function langLabel(code: string): string {
  return (parseLangCode(code) ?? code).toUpperCase();
}
