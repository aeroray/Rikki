import { LUNAR_MAX_YEAR, LUNAR_MIN_YEAR, lunarApi } from "./lunar";

export type AnniversaryCalendar = "solar" | "lunar";

export type Anniversary = {
  id: string;
  title: string;
  /** Solar month 1-12, or lunar month 1-12 depending on `calendar`. */
  month: number;
  /** Solar day 1-31, or lunar day 1-30 depending on `calendar`. */
  day: number;
  calendar: AnniversaryCalendar;
  leapMonth: boolean;
  startYear?: number | null;
  createdAt: number;
  updatedAt: number;
};

export type AnniversaryDraft = {
  title: string;
  /**
   * The single date field. Keeping the typed text (rather than separate
   * month/day/year numbers) is what lets one input carry the date, the
   * calendar, and the start year at once.
   */
  dateText: string;
};

export type Occurrence = {
  /** Local calendar day of the next occurrence. */
  date: Date;
  /** Whole days from today to the occurrence; 0 means today. */
  days: number;
  /** Solar year the occurrence lands in. */
  solarYear: number;
  /** Lunar year the occurrence belongs to (lunar dates only). */
  lunarYear: number | null;
  /** Human label for the recurrence count, e.g. 第 30 年. */
  ordinal: number | null;
  /** True when a leap-month date had to fall back to the regular month. */
  leapFallback: boolean;
};

const DAY_MS = 86_400_000;
/** Feb 29 birthdays land on Feb 28 in common years. */
const COMMON_YEAR_FEB_DAY = 28;

export function isLeapYear(year: number): boolean {
  return (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
}

export function daysInSolarMonth(month: number, year: number): number {
  if (month === 2) return isLeapYear(year) ? 29 : 28;
  if (month === 4 || month === 6 || month === 9 || month === 11) return 30;
  if (month >= 1 && month <= 12) return 31;
  return 0;
}

/** Stable day index in UTC so a DST change can never shift a countdown by one. */
export function dayIndex(date: Date): number {
  return Math.floor(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()) / DAY_MS);
}

export function startOfToday(now = new Date()): Date {
  return new Date(now.getFullYear(), now.getMonth(), now.getDate());
}

function clampSolarDay(month: number, day: number, year: number): number {
  const max = daysInSolarMonth(month, year);
  // A Feb 29 anniversary clamps to Feb 28; other days are already validated.
  if (month === 2 && day === 29 && max === 28) return COMMON_YEAR_FEB_DAY;
  return Math.min(day, max);
}

function solarDateFor(month: number, day: number, year: number): Date {
  return new Date(year, month - 1, clampSolarDay(month, day, year));
}

/**
 * Resolves a lunar month/day to its solar date in a given lunar year.
 *
 * A leap-month anniversary falls back to the regular month in years that have
 * no such leap month — the alternative is an anniversary that silently vanishes
 * for years at a time.
 */
function lunarDateFor(
  month: number,
  day: number,
  leapMonth: boolean,
  lunarYear: number,
): { date: Date; fallback: boolean } | null {
  const api = lunarApi();
  if (!api) return null;
  if (lunarYear < LUNAR_MIN_YEAR || lunarYear > LUNAR_MAX_YEAR) return null;

  const attempts = leapMonth ? [true, false] : [false];
  for (const useLeap of attempts) {
    const result = api.lunarToSolar(lunarYear, month, day, useLeap);
    if (result) {
      return {
        date: new Date(result.year, result.month - 1, result.day),
        fallback: leapMonth && !useLeap,
      };
    }
  }
  return null;
}

function ordinalFor(startYear: number | null | undefined, year: number): number | null {
  if (startYear === null || startYear === undefined) return null;
  const ordinal = year - startYear;
  return ordinal >= 0 ? ordinal : null;
}

function buildOccurrence(
  date: Date,
  today: Date,
  solarYear: number,
  lunarYear: number | null,
  startYear: number | null | undefined,
  leapFallback: boolean,
): Occurrence {
  return {
    date,
    days: dayIndex(date) - dayIndex(today),
    solarYear,
    lunarYear,
    ordinal: ordinalFor(startYear, lunarYear ?? solarYear),
    leapFallback,
  };
}

/**
 * The next time this anniversary happens, counting today as day 0.
 *
 * Returns `null` only when a lunar conversion is impossible (the tables are not
 * loaded yet, or the year is outside the convertible range).
 */
export function nextOccurrence(item: Anniversary, now = new Date()): Occurrence | null {
  const today = startOfToday(now);
  const startYear = item.startYear ?? null;

  if (item.calendar === "lunar") {
    const api = lunarApi();
    if (!api) return null;
    // A lunar year overlaps two solar years, so check the neighbours: 正月初一
    // of lunar year Y lands in solar year Y, while 腊月 of year Y lands in Y+1.
    for (let offset = -1; offset <= 1; offset += 1) {
      const lunarYear = today.getFullYear() + offset;
      const resolved = lunarDateFor(item.month, item.day, item.leapMonth, lunarYear);
      if (!resolved) continue;
      const occurrence = buildOccurrence(
        resolved.date,
        today,
        resolved.date.getFullYear(),
        lunarYear,
        startYear,
        resolved.fallback,
      );
      if (occurrence.days >= 0) return occurrence;
    }
    return null;
  }

  for (let offset = 0; offset <= 1; offset += 1) {
    const year = today.getFullYear() + offset;
    const date = solarDateFor(item.month, item.day, year);
    const occurrence = buildOccurrence(date, today, year, null, startYear, false);
    if (occurrence.days >= 0) return occurrence;
  }
  return null;
}

/** The lunar date that a solar anniversary falls on, for the row's meta line. */
export function lunarLabelFor(date: Date): string | null {
  const api = lunarApi();
  if (!api) return null;
  const result = api.solarToLunar({
    year: date.getFullYear(),
    month: date.getMonth() + 1,
    day: date.getDate(),
  });
  if (!result) return null;
  const prefix = result.leap ? "闰" : "";
  return `${prefix}${result.monthName}${result.dayName}`;
}

export type DateQuery =
  | { kind: "empty" }
  | { kind: "invalid" }
  | {
      kind: "date";
      month: number;
      day: number;
      /** Present when the input carried a year; used as the anniversary's start year. */
      year: number | null;
      calendar: AnniversaryCalendar;
      /** True only when the input explicitly asked for the leap month. */
      leapMonth: boolean;
    };

const FULL_DATE = /^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})$/;
const SHORT_DATE = /^(\d{1,2})[-/.](\d{1,2})$/;
/**
 * `n` (nónglì), `l`, or 农 marks a lunar date, and a following `r` / 闰 marks
 * the leap month: `n1001` is lunar Oct 1, `nr1001` is the leap Oct 1.
 *
 * The leap marker is explicit because a year cannot decide it: in a year whose
 * leap month is the 5th, "month 5" is ambiguous between the regular and the
 * leap month. Defaulting to the regular month matches how often each occurs,
 * and the form tells the user which month that year actually repeats.
 */
const LUNAR_PREFIX = /^(?:n|l|农)\s*(r|闰)?\s*/i;
// Kept in step with the library's own range so a year is never accepted here
// only to be rejected at conversion time.
const MIN_YEAR = LUNAR_MIN_YEAR;
const MAX_YEAR = LUNAR_MAX_YEAR;

function inRange(month: number, day: number, calendar: AnniversaryCalendar): boolean {
  if (month < 1 || month > 12) return false;
  if (calendar === "lunar") return day >= 1 && day <= 30;
  // Solar days are checked against a leap year so 02-29 stays typable; the
  // countdown clamps it in common years.
  return day >= 1 && day <= daysInSolarMonth(month, 2024);
}

function validYear(year: number): boolean {
  return year >= MIN_YEAR && year <= MAX_YEAR;
}

/**
 * Parses the text typed after the prefix.
 *
 * Accepted, in order of how often they are typed:
 *   `1001`      → Oct 1, recurring
 *   `20261001`  → Oct 1, recurring, first marked in 2026
 *   `n1001`     → lunar Oct 1 (also `l1001`, `农1001`)
 *   `nr1001`    → lunar leap Oct 1 (also `n闰1001`)
 *   `n19900515` → lunar May 15, first marked in 1990
 *   `10-01`, `2026-10-01`, `10/1` are accepted for people who type separators.
 *
 * A year is never a one-off date: it is the year the anniversary began, which
 * is what drives the "year N" count.
 */
export function parseDateQuery(raw: string): DateQuery {
  const text = raw.trim();
  if (!text) return { kind: "empty" };

  const lunarMatch = LUNAR_PREFIX.exec(text);
  const lunar = lunarMatch !== null;
  const leapMonth = Boolean(lunarMatch?.[1]);
  const body = lunar ? text.replace(LUNAR_PREFIX, "") : text;
  const calendar: AnniversaryCalendar = lunar ? "lunar" : "solar";
  if (!body) return { kind: "invalid" };

  const full = FULL_DATE.exec(body);
  if (full) {
    const year = Number(full[1]);
    const month = Number(full[2]);
    const day = Number(full[3]);
    if (!validYear(year) || !inRange(month, day, calendar)) return { kind: "invalid" };
    return { kind: "date", month, day, year, calendar, leapMonth };
  }

  const short = SHORT_DATE.exec(body);
  if (short) {
    const month = Number(short[1]);
    const day = Number(short[2]);
    if (!inRange(month, day, calendar)) return { kind: "invalid" };
    return { kind: "date", month, day, year: null, calendar, leapMonth };
  }

  // Compact digits: the separator is noise once the width is unambiguous.
  if (/^\d+$/.test(body)) {
    if (body.length === 8) {
      const year = Number(body.slice(0, 4));
      const month = Number(body.slice(4, 6));
      const day = Number(body.slice(6, 8));
      if (!validYear(year) || !inRange(month, day, calendar)) return { kind: "invalid" };
      return { kind: "date", month, day, year, calendar, leapMonth };
    }
    if (body.length === 4 || body.length === 3) {
      // `1001` is month 10 day 01; `101` is month 1 day 01, because a
      // two-digit month is written as `1001`.
      const split = body.length === 4 ? 2 : 1;
      const month = Number(body.slice(0, split));
      const day = Number(body.slice(split));
      if (!inRange(month, day, calendar)) return { kind: "invalid" };
      return { kind: "date", month, day, year: null, calendar, leapMonth };
    }
  }

  return { kind: "invalid" };
}

/**
 * The leap month of a lunar year, or 0 when it has none.
 *
 * This is a property of the year, which is what the form uses to tell the user
 * which month that year repeats — it cannot by itself decide that a given date
 * is the leap one, because a year repeating month 5 leaves "month 5"
 * ambiguous. That is why the leap flag comes from the input (`nr…`) instead.
 */
export function lunarLeapMonth(lunarYear: number): number {
  const api = lunarApi();
  if (!api) return 0;
  return api.leapMonthOf(lunarYear);
}

/** Countdown for a date typed straight into the palette, without saving it. */
export function queryOccurrence(query: DateQuery, now = new Date()): Occurrence | null {
  if (query.kind !== "date") return null;
  const today = startOfToday(now);

  if (query.calendar === "lunar") {
    const leapMonth = query.leapMonth;
    if (query.year !== null) {
      // A start year anchors the row but the date still recurs, so resolve the
      // next occurrence from today rather than the entered year.
      const pseudo: Anniversary = {
        id: "query",
        title: "",
        month: query.month,
        day: query.day,
        calendar: "lunar",
        leapMonth,
        startYear: query.year,
        createdAt: 0,
        updatedAt: 0,
      };
      return nextOccurrence(pseudo, today);
    }
    const pseudo: Anniversary = {
      id: "query",
      title: "",
      month: query.month,
      day: query.day,
      calendar: "lunar",
      leapMonth: false,
      startYear: null,
      createdAt: 0,
      updatedAt: 0,
    };
    return nextOccurrence(pseudo, today);
  }

  const pseudo: Anniversary = {
    id: "query",
    title: "",
    month: query.month,
    day: query.day,
    calendar: "solar",
    leapMonth: false,
    startYear: query.year,
    createdAt: 0,
    updatedAt: 0,
  };
  return nextOccurrence(pseudo, today);
}

export function formatDate(date: Date, locale: string): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return locale === "zh-CN" ? `${year}年${month}月${day}日` : `${year}-${month}-${day}`;
}

export function formatMonthDay(month: number, day: number, locale: string): string {
  const mm = String(month).padStart(2, "0");
  const dd = String(day).padStart(2, "0");
  return locale === "zh-CN" ? `${mm}月${dd}日` : `${mm}-${dd}`;
}

export function lunarMonthDayLabel(
  month: number,
  day: number,
  leapMonth: boolean,
  locale: string,
): string {
  const api = lunarApi();
  if (api) {
    const monthName = api.monthName(month);
    const dayName = api.dayName(day);
    if (monthName && dayName) {
      const prefix = leapMonth ? (locale === "zh-CN" ? "闰" : "leap ") : "";
      return `${prefix}${monthName}${dayName}`;
    }
  }
  const suffix = leapMonth ? "L" : "";
  return formatMonthDay(month, day, locale) + suffix;
}

export function sortByOccurrence(
  items: Anniversary[],
  now = new Date(),
): Array<{ item: Anniversary; occurrence: Occurrence | null }> {
  return items
    .map((item) => ({ item, occurrence: nextOccurrence(item, now) }))
    .sort((a, b) => {
      // Unresolvable rows sink to the bottom instead of hiding.
      if (!a.occurrence) return b.occurrence ? 1 : 0;
      if (!b.occurrence) return -1;
      if (a.occurrence.days !== b.occurrence.days) return a.occurrence.days - b.occurrence.days;
      return a.item.title.localeCompare(b.item.title);
    });
}

/** Renders a saved row back into the compact form the date field accepts. */
export function draftTextFor(item: {
  month: number;
  day: number;
  calendar: AnniversaryCalendar;
  startYear?: number | null;
}): string {
  const mm = String(item.month).padStart(2, "0");
  const dd = String(item.day).padStart(2, "0");
  const prefix = item.calendar === "lunar" ? "n" : "";
  if (item.startYear) return `${prefix}${item.startYear}${mm}${dd}`;
  return `${prefix}${mm}${dd}`;
}

export function draftFrom(item: Anniversary): AnniversaryDraft {
  return { title: item.title, dateText: draftTextFor(item) };
}

export function emptyDraft(dateText = ""): AnniversaryDraft {
  return { title: "", dateText };
}
