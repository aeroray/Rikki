import { parseDateQuery } from "$lib/commands/anniversary/dates";
import type { SolarDate } from "./grid";

export type CalendarScreen =
  | { type: "month" }
  | { type: "jump"; date: SolarDate }
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
    // A recurring date has no year; the calendar needs one, so use this year.
    const year = query.year ?? new Date().getFullYear();
    return { type: "jump", date: { year, month: query.month, day: query.day } };
  }
  return { type: "invalid", text };
}
