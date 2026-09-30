import {
  formatDate,
  formatMonthDay,
  lunarLabelFor,
  lunarMonthDayLabel,
  type Anniversary,
  type Occurrence,
} from "./dates";
import { i18n } from "$lib/i18n";

/** The countdown itself: the one number the whole feature exists to show. */
export function countdownLabel(days: number): string {
  if (days < 0) return i18n.t("anniversary.pastDays", { days: -days });
  if (days === 0) return i18n.t("anniversary.today");
  // "Tomorrow" reads far better than "in 1 day" and is the common case.
  if (days === 1) return i18n.t("anniversary.tomorrow");
  return i18n.t("anniversary.days", { days });
}

export function isToday(days: number): boolean {
  return days === 0;
}

/**
 * Row meta: the date it lands on, its lunar reading, and the year count.
 *
 * Order is deliberate — the solar date leads because that is what the user
 * checks against a calendar, and the lunar echo follows as a cross-check.
 */
export function occurrenceMeta(item: Anniversary, occurrence: Occurrence | null): string {
  if (!occurrence) return i18n.t("anniversary.awaitingLunar");

  const solar = formatMonthDay(occurrence.date.getMonth() + 1, occurrence.date.getDate(), i18n.locale);
  const parts: string[] = [solar];

  if (item.calendar === "lunar") {
    const lunar = lunarMonthDayLabel(item.month, item.day, item.leapMonth, i18n.locale);
    parts.push(occurrence.leapFallback ? i18n.t("anniversary.leapFallbackShort", { lunar }) : lunar);
  } else {
    // A solar anniversary gets a lunar echo, which is how people cross-check a
    // birthday against the lunar calendar.
    const lunar = lunarLabelFor(occurrence.date, i18n.locale);
    if (lunar) parts.push(lunar);
  }

  if (occurrence.ordinal !== null) parts.push(i18n.t("anniversary.years", { n: occurrence.ordinal }));

  return parts.join(" · ");
}

export function weekdayLabel(date: Date): string {
  return new Intl.DateTimeFormat(i18n.locale, { weekday: "long" }).format(date);
}

/** Everything the preview card shows for a date typed into the palette. */
export type PreviewLine = { id: string; label: string; value: string };

export function previewLines(
  query: { month: number; day: number; year: number | null; calendar: Anniversary["calendar"] },
  occurrence: Occurrence,
): PreviewLine[] {
  const lines: PreviewLine[] = [
    {
      id: "date",
      label: i18n.t("anniversary.date"),
      value: formatDate(occurrence.date, i18n.locale),
    },
    {
      id: "recurrence",
      label: i18n.t("anniversary.kind"),
      value: recurrenceLabel(query.month, query.day, query.calendar, false),
    },
  ];

  // A solar row gets its lunar reading as a cross-check. A lunar row does not
  // need a solar echo: the `date` line above already carries the solar date it
  // lands on, so repeating it here would just be the same value twice.
  if (query.calendar === "solar") {
    const lunar = lunarLabelFor(occurrence.date, i18n.locale);
    if (lunar) lines.push({ id: "lunar", label: i18n.t("anniversary.lunar"), value: lunar });
  }

  if (query.year !== null) {
    lines.push({
      id: "starts",
      label: i18n.t("anniversary.startYear"),
      value: String(query.year),
    });
  }

  if (occurrence.ordinal !== null) {
    lines.push({
      id: "ordinal",
      label: i18n.t("anniversary.ordinal"),
      value: i18n.t("anniversary.years", { n: occurrence.ordinal }),
    });
  }

  return lines;
}

/**
 * The saved recurrence, shown while editing or creating.
 *
 * A lunar recurrence is labelled only in the lunar calendar: the solar date it
 * lands on changes every year, so echoing the lunar numbers as a "solar" date
 * would be wrong (it once rendered `八月十五（08月15日）`).
 */
export function recurrenceLabel(
  month: number,
  day: number,
  calendar: Anniversary["calendar"],
  leapMonth: boolean,
): string {
  if (calendar === "lunar") return lunarMonthDayLabel(month, day, leapMonth, i18n.locale);
  return formatMonthDay(month, day, i18n.locale);
}
