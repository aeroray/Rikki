import { describe, expect, it } from "vitest";

import { relativeTime } from "$lib/commands/todo/format";

const NOW = 1_700_000_000_000;
const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

describe("relativeTime", () => {
  it("says 刚刚 inside a minute", () => {
    expect(relativeTime(NOW, NOW)).toEqual({ key: "todo.justNow" });
    expect(relativeTime(NOW - 59_000, NOW)).toEqual({ key: "todo.justNow" });
  });

  it("counts minutes, then hours, then days", () => {
    expect(relativeTime(NOW - MINUTE, NOW)).toEqual({ key: "todo.minutesAgo", vars: { n: 1 } });
    expect(relativeTime(NOW - 59 * MINUTE, NOW)).toEqual({
      key: "todo.minutesAgo",
      vars: { n: 59 },
    });
    expect(relativeTime(NOW - HOUR, NOW)).toEqual({ key: "todo.hoursAgo", vars: { n: 1 } });
    expect(relativeTime(NOW - 23 * HOUR, NOW)).toEqual({ key: "todo.hoursAgo", vars: { n: 23 } });
    expect(relativeTime(NOW - DAY, NOW)).toEqual({ key: "todo.daysAgo", vars: { n: 1 } });
    expect(relativeTime(NOW - 29 * DAY, NOW)).toEqual({ key: "todo.daysAgo", vars: { n: 29 } });
  });

  it("gives a date once a count of days stops being readable", () => {
    const result = relativeTime(NOW - 30 * DAY, NOW);
    expect(result.key).toBe("todo.date");
    expect(result.vars?.date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it("does not go negative when the clock moves back", () => {
    expect(relativeTime(NOW + 5 * DAY, NOW)).toEqual({ key: "todo.justNow" });
  });
});
