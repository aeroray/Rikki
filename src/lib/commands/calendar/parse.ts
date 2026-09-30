import { parseDateQuery } from "$lib/commands/anniversary/dates";
import { daysInMonth, type SolarDate } from "./grid";

export type CalendarScreen =
  | { type: "month" }
  | { type: "jump"; date: SolarDate }
  | { type: "lunar"; text: string }
  | { type: "invalid"; text: string };

/**
 * The text after the prefix: a date jumps the calendar to that month and day,
 * anything else is treated as a mistyped date.
 *
 * Reuses the anniversary parser so `cal 20261001` and `ann 20261001` agree on
 * what a date looks like.
 */
export function parseCalendarScreen(rest: string): CalendarScreen {
  const text = rest.trim();
  if (!text) return { type: "month" };

  const query = parseDateQuery(text);
  if (query.kind === "date") {
    // `ann` supports lunar dates; the month grid does not. Jumping anyway would
    // land on an unrelated solar date with nothing to say it was read
    // differently, so report it instead of guessing.
    if (query.calendar === "lunar") return { type: "lunar", text };

    // A recurring date has no year; the calendar needs one, so use this year.
    const year = query.year ?? new Date().getFullYear();
    // The anniversary parser deliberately accepts 2/29 so birthdays survive, but
    // the grid only contains real days. Jumping to 2026-02-29 selected no cell
    // at all and copied an impossible date to the clipboard.
    if (query.day > daysInMonth(year, query.month)) return { type: "invalid", text };

    return { type: "jump", date: { year, month: query.month, day: query.day } };
  }
  return { type: "invalid", text };
}
