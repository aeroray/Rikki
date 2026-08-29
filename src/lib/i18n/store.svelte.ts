import { en } from "$lib/i18n/en";
import { detectSystemLocale, type Locale } from "$lib/i18n/locale";
import { zhCN, type MessageKey } from "$lib/i18n/zh-CN";

const catalogs: Record<Locale, Record<MessageKey, string>> = {
  "zh-CN": zhCN,
  en,
};

function interpolate(template: string, vars?: Record<string, string | number>): string {
  if (!vars) return template;
  return template.replace(/\{(\w+)\}/g, (whole, key: string) => {
    const value = vars[key];
    return value === undefined ? whole : String(value);
  });
}

class I18nStore {
  locale = $state<Locale>(detectSystemLocale());

  t(key: MessageKey, vars?: Record<string, string | number>): string {
    return interpolate(catalogs[this.locale][key] ?? catalogs.en[key] ?? key, vars);
  }
}

export const i18n = new I18nStore();
export type { MessageKey };
