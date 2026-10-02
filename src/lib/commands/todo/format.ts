import type { MessageKey } from "$lib/i18n";

/** How long ago something was made, as a message key and the variables it wants. */
export type RelativeTime = {
  key: MessageKey;
  vars?: Record<string, string | number>;
};

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;
/** Past this, "42 天前" stops being easier to read than the date itself. */
const MONTH = 30 * DAY;

function pad(value: number): string {
  return value.toString().padStart(2, "0");
}

/**
 * How long ago a todo was made, in the coarsest unit that still says something.
 *
 * Coarse on purpose: the row is there to remind the user what the item is, and
 * "3 天前" is the whole of what anyone reads it for. A clock time would be more
 * precise and less useful.
 *
 * Past a month it gives a date, because a count of days that large is a number
 * the reader has to convert back into one. `YYYY-MM-DD` rather than a localized
 * form: it reads the same in both catalogs, and the alternative is a second
 * locale-aware formatter for a string that is already unambiguous.
 */
export function relativeTime(createdAt: number, now: number): RelativeTime {
  const elapsed = now - createdAt;
  // A clock that moved backwards, or a stamp from the future after a timezone
  // change. "刚刚" is the honest answer; a negative count is not.
  if (elapsed < MINUTE) return { key: "todo.justNow" };
  if (elapsed < HOUR) return { key: "todo.minutesAgo", vars: { n: Math.floor(elapsed / MINUTE) } };
  if (elapsed < DAY) return { key: "todo.hoursAgo", vars: { n: Math.floor(elapsed / HOUR) } };
  if (elapsed < MONTH) return { key: "todo.daysAgo", vars: { n: Math.floor(elapsed / DAY) } };

  const date = new Date(createdAt);
  return {
    key: "todo.date",
    vars: { date: `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}` },
  };
}
