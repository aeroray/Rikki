import { parseDateQuery, type DateQuery } from "./dates";

export type AnniversaryDateQuery = Extract<DateQuery, { kind: "date" }>;

export type AnniversaryScreen =
  | { type: "list" }
  | { type: "filter"; query: string }
  | { type: "preview"; query: AnniversaryDateQuery }
  | { type: "invalid" };

/** Text made only of digits, separators, or a lunar marker is a date attempt. */
function looksLikeDate(text: string): boolean {
  return /^(?:[nl农]\s*)?[\d\s\-/.:]+$/i.test(text);
}

/**
 * The text after the prefix does double duty: a date shows its countdown, any
 * other text filters the saved list.
 */
export function parseAnniversaryScreen(rest: string): AnniversaryScreen {
  const text = rest.trim();
  if (!text) return { type: "list" };

  const query = parseDateQuery(text);
  if (query.kind === "date") return { type: "preview", query };
  if (looksLikeDate(text)) return { type: "invalid" };
  return { type: "filter", query: text };
}
