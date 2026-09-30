import { LUNAR_MAX_YEAR, LUNAR_MIN_YEAR, lunarApi } from "$lib/commands/anniversary/lunar";

export type SolarDate = { year: number; month: number; day: number };

export type CalendarCell = {
  /** Day of the month; the cell is blank when this is 0. */
  day: number;
  /** Lunar day name (初二), or the lunar month name on the 1st (八月). */
  lunarLabel: string;
  /** The lunar date for the day, when the tables are loaded. */
  lunar: { month: number; day: number; leap: boolean; monthName: string; dayName: string } | null;
  isToday: boolean;
  isWeekend: boolean;
  /** Days in this lunar month, shown in the detail line. */
  lunarMonthDays: number;
};

export type CalendarGrid = {
  year: number;
  month: number;
  /** Monday-first weekday headers, 7 entries. */
  weekdays: number[];
  /** Whole weeks covering the month, each 7 cells. */
  weeks: CalendarCell[][];
  /** Lunar year info for the header. */
  lunarYear: { ganZhi: string; zodiac: string; days: number } | null;
};

const DAY_MS = 86_400_000;
/** Monday-first, matching the convention Chinese calendars use. */
export const WEEK_START = 1;

export function today(now = new Date()): SolarDate {
  return { year: now.getFullYear(), month: now.getMonth() + 1, day: now.getDate() };
}

export function sameDate(a: SolarDate, b: SolarDate): boolean {
  return a.year === b.year && a.month === b.month && a.day === b.day;
}

export function daysInMonth(year: number, month: number): number {
  return new Date(year, month, 0).getDate();
}

/** Monday-first weekday index: 0 = Monday … 6 = Sunday. */
export function weekdayIndex(date: SolarDate): number {
  const js = new Date(date.year, date.month - 1, date.day).getDay();
  return (js + 6) % 7;
}

/** Shifts a date by whole days, using local calendar arithmetic. */
export function addDays(date: SolarDate, delta: number): SolarDate {
  const next = new Date(date.year, date.month - 1, date.day + delta);
  return { year: next.getFullYear(), month: next.getMonth() + 1, day: next.getDate() };
}

/**
 * Shifts by whole months, clamping the day so 31 Jan + 1 month lands on 28/29
 * Feb instead of rolling into March.
 */
export function addMonths(date: SolarDate, delta: number): SolarDate {
  const target = new Date(date.year, date.month - 1 + delta, 1);
  const year = target.getFullYear();
  const month = target.getMonth() + 1;
  return { year, month, day: Math.min(date.day, daysInMonth(year, month)) };
}

export function inRange(date: SolarDate): boolean {
  return date.year >= LUNAR_MIN_YEAR && date.year <= LUNAR_MAX_YEAR;
}

/** The lunar label shown in a cell: month name on the 1st, day name otherwise. */
function cellLabel(lunar: { day: number; monthName: string; dayName: string }): string {
  return lunar.day === 1 ? `${lunar.monthName}月` : lunar.dayName;
}

/**
 * Builds the month grid.
 *
 * Lunar data is optional: before the tables load the grid still renders solar
 * days, and the caller re-derives once `lunarReady` flips.
 */
export function buildGrid(year: number, month: number, now = new Date()): CalendarGrid {
  const api = lunarApi();
  const current = today(now);
  const total = daysInMonth(year, month);
  const lead = weekdayIndex({ year, month, day: 1 });

  const cells: CalendarCell[] = [];
  for (let day = 1; day <= total; day += 1) {
    const date = { year, month, day };
    const lunar = api?.solarToLunar(date) ?? null;
    const weekday = weekdayIndex(date);
    cells.push({
      day,
      lunarLabel: lunar ? cellLabel(lunar) : "",
      lunar: lunar
        ? {
            month: lunar.month,
            day: lunar.day,
            leap: lunar.leap,
            monthName: lunar.monthName,
            dayName: lunar.dayName,
          }
        : null,
      isToday: sameDate(date, current),
      isWeekend: weekday >= 5,
      lunarMonthDays: lunar ? (api?.lunarMonthDays(date) ?? 0) : 0,
    });
  }

  // Pad to whole weeks with blanks so the grid keeps its columns.
  const padded: CalendarCell[] = [
    ...Array.from({ length: lead }, () => blankCell()),
    ...cells,
  ];
  while (padded.length % 7 !== 0) padded.push(blankCell());

  const weeks: CalendarCell[][] = [];
  for (let i = 0; i < padded.length; i += 7) weeks.push(padded.slice(i, i + 7));

  // The header's ganzhi belongs to the lunar year that mostly covers this month.
  const lunarYear = api
    ? (() => {
        const probe = api.solarToLunar({ year, month, day: 15 }) ?? api.solarToLunar({ year, month, day: 1 });
        if (!probe) return null;
        return {
          ganZhi: api.yearGanZhi(probe.year),
          zodiac: api.yearZodiac(probe.year),
          days: api.lunarYearDays(probe.year),
        };
      })()
    : null;

  return {
    year,
    month,
    weekdays: Array.from({ length: 7 }, (_, i) => i),
    weeks,
    lunarYear,
  };
}

/** A fresh blank cell; each must be its own object so cells cannot alias. */
function blankCell(): CalendarCell {
  return {
    day: 0,
    lunarLabel: "",
    lunar: null,
    isToday: false,
    isWeekend: false,
    lunarMonthDays: 0,
  };
}

/** Whole days between two local calendar dates. */
export function dayDelta(from: SolarDate, to: SolarDate): number {
  const a = Date.UTC(from.year, from.month - 1, from.day);
  const b = Date.UTC(to.year, to.month - 1, to.day);
  return Math.round((b - a) / DAY_MS);
}

/** ISO-ish key used for `key` blocks and copy actions. */
export function dateKey(date: SolarDate): string {
  const mm = String(date.month).padStart(2, "0");
  const dd = String(date.day).padStart(2, "0");
  return `${date.year}-${mm}-${dd}`;
}
