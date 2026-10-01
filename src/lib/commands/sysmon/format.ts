import { i18n } from "$lib/i18n";

/** A percentage, rounded. The panel has room for a whole number and no more. */
export function percent(value: number): string {
  return `${Math.round(value)}%`;
}

const UNITS = ["B", "KB", "MB", "GB", "TB"];

/**
 * Bytes in the largest unit that keeps the number small.
 *
 * One decimal below 100 and none above: "1.2 GB" says more than "1 GB", and
 * "412 GB" says more than "412.3 GB".
 */
export function bytes(value: number): string {
  let size = value;
  let unit = 0;
  while (size >= 1024 && unit < UNITS.length - 1) {
    size /= 1024;
    unit += 1;
  }
  const digits = unit > 0 && size < 100 ? 1 : 0;
  return `${size.toFixed(digits)} ${UNITS[unit]}`;
}

/**
 * Uptime as the two units that matter.
 *
 * A machine up for three days does not need its seconds, and one up for four
 * minutes does not need its days — the smaller unit is dropped rather than padded
 * out, so the line stays short.
 */
export function duration(seconds: number): string {
  const days = Math.floor(seconds / 86_400);
  const hours = Math.floor((seconds % 86_400) / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  if (days > 0) return i18n.t("sysmon.uptimeDays", { days, hours });
  if (hours > 0) return i18n.t("sysmon.uptimeHours", { hours, minutes });
  return i18n.t("sysmon.uptimeMinutes", { minutes });
}

/** How full something is, 0..100, safe against a zero total. */
export function fill(used: number, total: number): number {
  if (total <= 0) return 0;
  return Math.max(0, Math.min(100, (used / total) * 100));
}

/**
 * A CPU brand cut down to the part that identifies it.
 *
 * The full string is vendor boilerplate wrapped around one model number —
 * "12th Gen Intel(R) Core(TM) i5-12400F @ 2.50GHz" — and the panel has half a row
 * to say it in. The marketing words and the clock go, because the clock is already
 * shown beside it; the model stays.
 */
export function shortBrand(brand: string): string {
  const trimmed = brand
    .replace(/\((?:R|TM|C)\)/gi, " ")
    // `8-Core` and `12 Core` as a whole, before the bare word goes: stripping
    // "Core" first left "Ryzen 7 5800X 8-" with the count dangling off the end.
    .replace(/\b\d+\s*-\s*cores?\b/gi, " ")
    .replace(/\b(?:CPU|Processor|Core|Intel|AMD|Gen)\b/gi, " ")
    .replace(/\b\d+(?:st|nd|rd|th)\b/gi, " ")
    .replace(/@\s*[\d.]+ ?GHz/gi, " ")
    .replace(/\s+/g, " ")
    .replace(/[\s-]+$/, "")
    .trim();
  // An unrecognised brand is better whole than emptied.
  return trimmed || brand;
}
