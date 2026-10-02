import { describe, expect, it } from "vitest";

import { groupByDay } from "$lib/commands/clip/group";

type Entry = { id: string; createdAt: number };

/** A local wall-clock time, so the test does not depend on the runner's zone. */
function at(year: number, month: number, day: number, hour: number, minute = 0): number {
  return new Date(year, month - 1, day, hour, minute).getTime();
}

function entry(id: string, createdAt: number): Entry {
  return { id, createdAt };
}

describe("groupByDay", () => {
  const now = at(2026, 10, 2, 14, 0);

  it("names today and yesterday", () => {
    const groups = groupByDay(
      [entry("a", at(2026, 10, 2, 9)), entry("b", at(2026, 10, 1, 9))],
      now,
    );
    expect(groups.map((group) => group.label.key)).toEqual(["time.today", "time.yesterday"]);
  });

  it("falls back to a date", () => {
    const groups = groupByDay([entry("a", at(2026, 9, 28, 9))], now);
    expect(groups[0].label.key).toBe("time.date");
    expect(groups[0].label.vars?.date).toBe("2026-09-28");
  });

  /// The point of comparing local days: 23:50 and 00:10 are ten minutes apart and
  /// belong under different headings.
  it("splits at local midnight, not at 24-hour windows", () => {
    const groups = groupByDay(
      [entry("a", at(2026, 10, 2, 0, 10)), entry("b", at(2026, 10, 1, 23, 50))],
      now,
    );
    expect(groups).toHaveLength(2);
    expect(groups[0].label.key).toBe("time.today");
    expect(groups[1].label.key).toBe("time.yesterday");
  });

  it("keeps several entries in one day together, in the order given", () => {
    const groups = groupByDay(
      [
        entry("a", at(2026, 10, 2, 12)),
        entry("b", at(2026, 10, 2, 9)),
        entry("c", at(2026, 10, 1, 9)),
      ],
      now,
    );
    expect(groups).toHaveLength(2);
    expect(groups[0].entries.map((item) => item.id)).toEqual(["a", "b"]);
    expect(groups[1].entries.map((item) => item.id)).toEqual(["c"]);
  });

  it("returns nothing for an empty list", () => {
    expect(groupByDay([], now)).toEqual([]);
  });
});
