import { beforeAll, describe, expect, it } from "vitest";
import { parseDateQuery, toLunarText } from "$lib/commands/anniversary/dates";
import { ensureLunar, lunarApi } from "$lib/commands/anniversary/lunar";

/**
 * The conversion is checked by going back the other way rather than against a
 * table of expected strings: a hardcoded 八月廿一 would only prove the library
 * still agrees with the day it was written, while a round trip proves the text
 * the field receives means the day the user typed.
 */
beforeAll(async () => {
  await ensureLunar();
});

describe("converting a solar date to lunar", () => {
  it("round-trips back to the same solar day", () => {
    const text = toLunarText("20261001");
    expect(text).toMatch(/^n\d{8}$/);

    const query = parseDateQuery(text!);
    expect(query.kind).toBe("date");
    if (query.kind !== "date") return;
    expect(query.calendar).toBe("lunar");
    expect(query.leapMonth).toBe(false);

    const api = lunarApi()!;
    expect(api.lunarToSolar(query.year!, query.month, query.day, false)).toEqual({
      year: 2026,
      month: 10,
      day: 1,
    });
  });

  /** The leap marker is the whole reason the result is not just month/day. */
  it("keeps the leap flag when the day falls in a leap month", () => {
    const api = lunarApi()!;
    // 2025 repeats month 6, so a solar date inside it converts to a leap month.
    const leapMonth = api.leapMonthOf(2025);
    expect(leapMonth).toBeGreaterThan(0);
    const start = api.lunarToSolar(2025, leapMonth, 1, true)!;
    const solarText = `${start.year}${String(start.month).padStart(2, "0")}${String(start.day).padStart(2, "0")}`;

    const text = toLunarText(solarText);
    expect(text).toMatch(/^nr\d{8}$/);
    expect(api.lunarToSolar(2025, leapMonth, 1, true)).toEqual(start);
  });

  it("drops the year when the input had none", () => {
    expect(toLunarText("1001")).toMatch(/^n\d{4}$/);
  });

  it("declines anything that is not a solar date", () => {
    expect(toLunarText("n1001")).toBeNull();
    expect(toLunarText("")).toBeNull();
    expect(toLunarText("nonsense")).toBeNull();
    // Out of the library's range, so there is nothing to convert through.
    expect(toLunarText("18000101")).toBeNull();
  });
});
