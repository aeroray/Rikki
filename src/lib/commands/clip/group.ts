import type { MessageKey } from "$lib/i18n";

/** A run of entries made on one day, with the heading that names it. */
export type DayGroup<T> = {
  /** The day's local start, in ms. Also the `{#each}` key. */
  day: number;
  label: { key: MessageKey; vars?: Record<string, string | number> };
  entries: T[];
};

const DAY = 24 * 60 * 60 * 1000;

function startOfDay(ms: number): number {
  const date = new Date(ms);
  date.setHours(0, 0, 0, 0);
  return date.getTime();
}

function pad(value: number): string {
  return value.toString().padStart(2, "0");
}

/**
 * Splits a list into one group per calendar day, newest first.
 *
 * The list arrives already sorted by time, so this only has to notice where the
 * day changes. It compares *local* day boundaries rather than 24-hour windows:
 * "today" is whatever the user's clock says it is, not what has elapsed since
 * this moment — otherwise an entry from 23:50 last night and one from 00:10 this
 * morning would share a heading, and the heading would be wrong for one of them.
 *
 * Generic over the entry so the grouping can be tested without a clipboard, and
 * so the same function serves anything else that grows a dated list.
 */
export function groupByDay<T extends { createdAt: number }>(
  entries: T[],
  now: number,
): DayGroup<T>[] {
  const today = startOfDay(now);
  const yesterday = startOfDay(today - DAY);
  const groups: DayGroup<T>[] = [];

  for (const entry of entries) {
    const day = startOfDay(entry.createdAt);
    const last = groups[groups.length - 1];
    if (last && last.day === day) {
      last.entries.push(entry);
      continue;
    }
    groups.push({ day, label: labelFor(day, today, yesterday), entries: [entry] });
  }

  return groups;
}

/**
 * The heading for one day: 今天, 昨天, or the date.
 *
 * `YYYY-MM-DD` rather than a localized form, matching the todo rows: it reads
 * the same in both catalogs, and the alternative is a second locale-aware
 * formatter for a string that is already unambiguous.
 */
function labelFor(
  day: number,
  today: number,
  yesterday: number,
): { key: MessageKey; vars?: Record<string, string | number> } {
  if (day === today) return { key: "time.today" };
  if (day === yesterday) return { key: "time.yesterday" };
  const date = new Date(day);
  return {
    key: "time.date",
    vars: { date: `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}` },
  };
}
