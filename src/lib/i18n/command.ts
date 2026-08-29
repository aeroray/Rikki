import type { Command } from "$lib/commands/types";
import type { Locale } from "$lib/i18n/locale";

export function commandTitle(command: Command, locale: Locale): string {
  if (locale === "zh-CN" && command.titleZh) return `${command.titleZh} · ${command.title}`;
  return command.title;
}

export function commandDescription(command: Command, locale: Locale): string {
  if (locale === "zh-CN" && command.descriptionZh) return command.descriptionZh;
  return command.description;
}
