export type Locale = "zh-CN" | "en";
export type LocalePref = "system" | Locale;

export const LOCALES: Locale[] = ["zh-CN", "en"];
export const LOCALE_PREFS: LocalePref[] = ["system", "zh-CN", "en"];

export function detectSystemLocale(): Locale {
  // Only the primary language decides. Scanning every entry in
  // `navigator.languages` meant a machine whose main language is English but
  // which lists Chinese as a secondary preference started up in Chinese.
  const lang = typeof navigator === "undefined" ? "" : navigator.language;
  return /^zh\b/i.test(lang) ? "zh-CN" : "en";
}

export function parseLocalePref(value: string | undefined | null): LocalePref {
  if (value === "zh-CN" || value === "en" || value === "system") return value;
  return "system";
}

export function resolveLocale(pref: LocalePref): Locale {
  return pref === "system" ? detectSystemLocale() : pref;
}
