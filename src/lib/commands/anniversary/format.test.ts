import { beforeAll, describe, expect, it } from "vitest";
import type { Anniversary, Occurrence } from "$lib/commands/anniversary/dates";
import { occurrenceMeta } from "$lib/commands/anniversary/format";
import { ensureLunar } from "$lib/commands/anniversary/lunar";
import { i18n } from "$lib/i18n";

/**
 * The row's meta line leads with the calendar the anniversary is kept in, which
 * is the whole point of the line. A lunar date saved as 十月初三 lands on a
 * different solar day every year, so printing that day first read as though the
 * saved date had been mistyped.
 */
beforeAll(async () => {
  i18n.locale = "zh-CN";
  // Without the tables the lunar label falls back to numbers, and the assertion
  // would be about that fallback instead of the ordering.
  await ensureLunar();
});

const base: Anniversary = {
  id: "1",
  title: "安安生日",
  month: 10,
  day: 3,
  calendar: "lunar",
  leapMonth: false,
  startYear: 2025,
  createdAt: 0,
  updatedAt: 0,
};

const occurrence: Occurrence = {
  // 2026-11-11, where 十月初三 falls that year.
  date: new Date(2026, 10, 11),
  days: 41,
  solarYear: 2026,
  lunarYear: 2026,
  ordinal: 1,
  leapFallback: false,
};

describe("a row's meta line", () => {
  it("leads with the lunar date when that is what was saved", () => {
    const meta = occurrenceMeta(base, occurrence);
    expect(meta.startsWith("十月初三")).toBe(true);
    expect(meta).toContain("11月11日");
  });

  it("leads with the solar date when that is what was saved", () => {
    const meta = occurrenceMeta({ ...base, calendar: "solar", month: 11, day: 11 }, occurrence);
    expect(meta.startsWith("11月11日")).toBe(true);
  });
});
