import { describe, expect, it } from "vitest";
import { clockOf, delayOptions, parseDelay } from "$lib/commands/sys/schedule";

/** A fixed clock, so `23:00` means the same thing in every run. */
const NOON = new Date(2026, 9, 1, 12, 0, 0);

describe("parseDelay", () => {
  it("reads a bare number as minutes", () => {
    // "shut down in 30" is the phrasing people use, and the presets are minutes,
    // so the typed and clicked paths have to agree.
    expect(parseDelay("30", NOON)).toBe(30 * 60);
    expect(parseDelay("1", NOON)).toBe(60);
    expect(parseDelay("0", NOON)).toBeNull();
  });

  it("reads the unit suffixes", () => {
    expect(parseDelay("30m", NOON)).toBe(1800);
    expect(parseDelay("1h", NOON)).toBe(3600);
    expect(parseDelay("90min", NOON)).toBe(5400);
    expect(parseDelay("45s", NOON)).toBe(45);
    expect(parseDelay("2h", NOON)).toBe(7200);
  });

  it("adds combined units", () => {
    expect(parseDelay("1h30m", NOON)).toBe(5400);
    expect(parseDelay("1h 30m", NOON)).toBe(5400);
    expect(parseDelay("30m1h", NOON)).toBe(5400);
  });

  it("resolves a time of day to the next time it occurs", () => {
    // Noon to 23:00 is eleven hours.
    expect(parseDelay("23:00", NOON)).toBe(11 * 3600);
    // 13:00 is an hour away.
    expect(parseDelay("13:00", NOON)).toBe(3600);
  });

  it("rolls a past time to tomorrow rather than going negative", () => {
    // 09:00 has already happened at noon. A negative delay would be accepted by
    // the backend and fire immediately, which is the opposite of what was asked.
    expect(parseDelay("09:00", NOON)).toBe(21 * 3600);
    // Exactly now counts as tomorrow too, so the answer is never zero.
    expect(parseDelay("12:00", NOON)).toBe(24 * 3600);
  });

  it("accepts seconds in a clock time", () => {
    expect(parseDelay("13:00:30", NOON)).toBe(3630);
  });

  it("refuses a time that does not exist", () => {
    expect(parseDelay("25:00", NOON)).toBeNull();
    expect(parseDelay("12:61", NOON)).toBeNull();
    expect(parseDelay("12:00:99", NOON)).toBeNull();
  });

  it("refuses text that is not a delay at all", () => {
    expect(parseDelay("", NOON)).toBeNull();
    expect(parseDelay("soon", NOON)).toBeNull();
    expect(parseDelay("later", NOON)).toBeNull();
    // A number with a unit that does not exist must not be read as a bare number.
    expect(parseDelay("30x", NOON)).toBeNull();
  });

  it("tolerates surrounding whitespace and case", () => {
    expect(parseDelay("  1H30M  ", NOON)).toBe(5400);
  });
});

describe("delayOptions", () => {
  it("offers the presets when nothing is typed", () => {
    const options = delayOptions("", NOON);
    expect(options.length).toBeGreaterThan(0);
    // "Now" leads, because it was the only behaviour before this panel existed.
    expect(options[0].seconds).toBe(0);
    expect(options[1].seconds).toBe(15 * 60);
  });

  it("leads with a typed value that is not a preset", () => {
    // Enter takes the first row, and the user who typed a specific delay is the
    // one who wants it.
    const options = delayOptions("45m", NOON);
    expect(options[0].seconds).toBe(45 * 60);
    expect(options.length).toBe(delayOptions("", NOON).length + 1);
  });

  it("does not duplicate a preset that was typed", () => {
    const options = delayOptions("30", NOON);
    expect(options.length).toBe(delayOptions("", NOON).length);
  });

  it("falls back to the presets for text it cannot read", () => {
    // The footer says the text was not understood; the list still offers a way out.
    const options = delayOptions("tomorrow", NOON);
    expect(options.length).toBe(delayOptions("", NOON).length);
  });
});

describe("clockOf", () => {
  it("names the wall-clock time a delay lands on", () => {
    // "2 小时" is harder to place than "14:00".
    expect(clockOf(NOON, 2 * 3600)).toBe("14:00");
    expect(clockOf(NOON, 15 * 60)).toBe("12:15");
  });

  it("wraps past midnight", () => {
    expect(clockOf(NOON, 13 * 3600)).toBe("01:00");
  });

  it("names no time for now", () => {
    // There is no time to name, and "12:00" beside "立即" would read as a delay.
    expect(clockOf(NOON, 0)).toBe("");
  });
});
