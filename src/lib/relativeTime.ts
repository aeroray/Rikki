import { i18n } from "$lib/i18n";

export function relativeTime(from: number, now: number): string {
  const sec = Math.max(0, Math.floor((now - from) / 1000));
  if (sec < 10) return i18n.t("time.justNow");
  if (sec < 60) return i18n.t("time.secondsAgo", { n: sec });
  const min = Math.floor(sec / 60);
  if (min < 60) return i18n.t("time.minutesAgo", { n: min });
  const hour = Math.floor(min / 60);
  if (hour < 24) return i18n.t("time.hoursAgo", { n: hour });
  const day = Math.floor(hour / 24);
  if (day < 30) return i18n.t("time.daysAgo", { n: day });
  const month = Math.floor(day / 30);
  if (month < 12) return i18n.t("time.monthsAgo", { n: month });
  return i18n.t("time.yearsAgo", { n: Math.floor(month / 12) });
}
