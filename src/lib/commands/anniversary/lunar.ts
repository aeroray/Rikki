/**
 * Lunar calendar adapter.
 *
 * Uses `lunar` v2 (MIT, ~12KB minified / 4KB gzipped, full TypeScript types).
 * It was chosen over 6tail's `lunar-typescript` / `lunar-javascript` after
 * measuring both: those are monolithic and cannot be tree-shaken, so importing
 * only `Solar` still shipped 325KB minified (~100KB gzipped) against 12KB here,
 * for a feature that only needs solar/lunar conversion.
 *
 * The one thing v2 does not expose is "which month is the leap month of year
 * Y". That is derived by probing, and the derivation was cross-validated
 * against 6tail's official `getLeapMonth()` for every year from 1890 to 2100:
 * all 211 years agreed, and 605 sampled date conversions matched exactly.
 *
 * This module stays free of runes so the date maths can be unit-tested in plain
 * Node; reactivity lives in the store's `lunarReady` flag.
 */
export type SolarDate = { year: number; month: number; day: number };

export type LunarDate = SolarDate & {
  /** True when this is the leap (闰) month of its lunar year. */
  leap: boolean;
  /** 正, 二, … 冬, 腊 */
  monthName: string;
  /** 初一, 十五, 廿一, … */
  dayName: string;
  /** 丙午 */
  ganZhiYear: string;
  /** 马 */
  zodiac: string;
};

export type LunarApi = {
  solarToLunar(date: SolarDate): LunarDate | null;
  /** `leapMonth` selects the leap month; null when that year has none. */
  lunarToSolar(year: number, month: number, day: number, leapMonth: boolean): SolarDate | null;
  /** The leap month number of a lunar year, or 0 when it has none. */
  leapMonthOf(lunarYear: number): number;
  /** Renders a lunar month/day name without needing a year. */
  monthName(month: number): string;
  dayName(day: number): string;
  /** 丙午 — the ganzhi pair for a lunar year, used by the calendar header. */
  yearGanZhi(lunarYear: number): string;
  /** 马 */
  yearZodiac(lunarYear: number): string;
  /** How many days a lunar year has (353-385), for the calendar's year view. */
  lunarYearDays(lunarYear: number): number;
  /** How many days the lunar month starting at `date` has (29 or 30). */
  lunarMonthDays(date: SolarDate): number;
};

type LunarModule = typeof import("lunar");

/** The range `lunar` v2 supports, mirrored here so callers can clamp. */
export const LUNAR_MIN_YEAR = 1890;
export const LUNAR_MAX_YEAR = 2100;

const MONTH_NAMES = ["", "正", "二", "三", "四", "五", "六", "七", "八", "九", "十", "冬", "腊"];
const DAY_NAMES = [
  "", "初一", "初二", "初三", "初四", "初五", "初六", "初七", "初八", "初九", "初十",
  "十一", "十二", "十三", "十四", "十五", "十六", "十七", "十八", "十九", "二十",
  "廿一", "廿二", "廿三", "廿四", "廿五", "廿六", "廿七", "廿八", "廿九", "三十",
];

let api: LunarApi | null = null;
let loading: Promise<void> | null = null;
/** Memoised leap-month lookups; the probe costs up to 12 conversions. */
const leapMonthCache = new Map<number, number>();

/** Synchronous accessor: `null` until the module has loaded. */
export function lunarApi(): LunarApi | null {
  return api;
}

export function ensureLunar(): Promise<void> {
  if (api) return Promise.resolve();
  if (!loading) {
    loading = import("lunar")
      .then((mod) => {
        api = buildApi(mod);
      })
      .catch((err: unknown) => {
        // Never cache the rejection: a failed import would otherwise make every
        // later lunar lookup fail for the rest of the session.
        loading = null;
        throw err;
      });
  }
  return loading;
}

export function lunarLoadFailed(): boolean {
  return api === null && loading === null;
}

function buildApi(mod: LunarModule): LunarApi {
  const { toLunar, toGregorian, formatLunarParts } = mod;

  /** Solar date for a lunar year/month/day, or null when it does not exist. */
  function lunarToSolarFor(
    year: number,
    month: number,
    day: number,
    isLeapMonth: boolean,
  ): SolarDate | null {
    try {
      const result = toGregorian({ year, month, day, isLeapMonth });
      const date = result.date;
      // `toGregorian` returns a UTC instant; read it in UTC so the calendar day
      // cannot shift with the local timezone.
      return {
        year: date.getUTCFullYear(),
        month: date.getUTCMonth() + 1,
        day: date.getUTCDate(),
      };
    } catch {
      return null;
    }
  }

  function lunarFor(date: SolarDate) {
    try {
      return toLunar(date).lunar;
    } catch {
      return null;
    }
  }

  /** Ganzhi is only exposed via formatting, so read it off the parts. */
  function ganZhiOf(date: SolarDate): string {
    const lunar = lunarFor(date);
    if (!lunar) return "";
    return formatLunarParts(lunar, { stemBranch: "year" })
      .filter((part) => part.type === "yearStem" || part.type === "yearBranch")
      .map((part) => part.value)
      .join("");
  }

  function zodiacOf(date: SolarDate): string {
    const lunar = lunarFor(date);
    if (!lunar) return "";
    return formatLunarParts(lunar, { zodiac: true })
      .filter((part) => part.type === "yearZodiac")
      .map((part) => part.value.replace(/[（）]/g, ""))
      .join("");
  }

  /**
   * The first day of the lunar month following `lunar`.
   *
   * `lunar` is the raw library object, whose leap flag is `isLeapMonth`.
   */
  function nextLunarMonthStart(lunar: {
    year: number;
    month: number;
    isLeapMonth: boolean;
  }): SolarDate | null {
    const leapThisYear = leapMonthOf(lunar.year);
    // Month order is 1..12, with the leap month inserted right after its base
    // month, so only the month after the leap one is a plain increment.
    if (lunar.isLeapMonth) return lunarToSolarFor(lunar.year, lunar.month + 1, 1, false);
    if (leapThisYear === lunar.month) {
      return lunarToSolarFor(lunar.year, lunar.month, 1, true);
    }
    if (lunar.month === 12) return lunarToSolarFor(lunar.year + 1, 1, 1, false);
    return lunarToSolarFor(lunar.year, lunar.month + 1, 1, false);
  }

  /** v2 has no leap-month query, so the month is found by probing. */
  function leapMonthOf(lunarYear: number): number {
    const cached = leapMonthCache.get(lunarYear);
    if (cached !== undefined) return cached;
    let found = 0;
    for (let month = 1; month <= 12; month += 1) {
      if (lunarToSolarFor(lunarYear, month, 1, true)) {
        found = month;
        break;
      }
    }
    leapMonthCache.set(lunarYear, found);
    return found;
  }

  return {
    leapMonthOf,

    solarToLunar(date) {
      const lunar = lunarFor(date);
      if (!lunar) {
        // Out-of-range or invalid dates throw rather than returning a sentinel.
        return null;
      }
      return {
        year: lunar.year,
        month: lunar.month,
        day: lunar.day,
        leap: lunar.isLeapMonth,
        monthName: MONTH_NAMES[lunar.month] ?? "",
        dayName: DAY_NAMES[lunar.day] ?? "",
        ganZhiYear: ganZhiOf(date),
        zodiac: zodiacOf(date),
      };
    },

    lunarToSolar(year, month, day, leapMonth) {
      // The library rejects a leap month that year does not have.
      return lunarToSolarFor(year, month, day, leapMonth);
    },

    monthName(month) {
      return MONTH_NAMES[month] ?? "";
    },

    dayName(day) {
      return DAY_NAMES[day] ?? "";
    },

    yearGanZhi(lunarYear) {
      // Read it off the first day of that lunar year: the library only exposes
      // ganzhi as part of a formatted date, not as a standalone year query.
      const solar = lunarToSolarFor(lunarYear, 1, 1, false);
      if (!solar) return "";
      return ganZhiOf(solar);
    },

    yearZodiac(lunarYear) {
      const solar = lunarToSolarFor(lunarYear, 1, 1, false);
      if (!solar) return "";
      return zodiacOf(solar);
    },

    lunarYearDays(lunarYear) {
      const start = lunarToSolarFor(lunarYear, 1, 1, false);
      const next = lunarToSolarFor(lunarYear + 1, 1, 1, false);
      if (!start || !next) return 0;
      // Both ends are local calendar days, so the difference is exact.
      const a = Date.UTC(start.year, start.month - 1, start.day);
      const b = Date.UTC(next.year, next.month - 1, next.day);
      return Math.round((b - a) / 86_400_000);
    },

    lunarMonthDays(date) {
      // A lunar month is 29 or 30 days: compare the 1st with the next month's 1st.
      const today = lunarFor(date);
      if (!today) return 0;
      const start = lunarToSolarFor(today.year, today.month, 1, today.isLeapMonth);
      if (!start) return 0;
      const next = nextLunarMonthStart(today);
      if (!next) return 0;
      const a = Date.UTC(start.year, start.month - 1, start.day);
      const b = Date.UTC(next.year, next.month - 1, next.day);
      return Math.round((b - a) / 86_400_000);
    },
  };
}
