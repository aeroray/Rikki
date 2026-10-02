/**
 * What the text after `todo ` means.
 *
 * A `#label` that ends the line is a label, and a line that is *only* a label is
 * a filter rather than an empty todo: `todo #购物` has nothing to create, and
 * reading it as a new blank item is the one interpretation nobody wants.
 */
export type TodoDraft =
  | { kind: "empty" }
  | { kind: "filter"; tag: string }
  | { kind: "create"; text: string; tag: string };

/**
 * The label has to end the line and has to start at a word boundary.
 *
 * That is what keeps `#1 修 bug` and `议题#3` as ordinary text, which is what
 * they are. A rule that grabbed any `#` anywhere would eat the text of anyone
 * writing about issue numbers, and the fix would be to escape it — a syntax the
 * user has to remember is worse than one they can read off the row.
 *
 * The label may be empty: `todo #` names no label, which is a request to see
 * them rather than a filter over nothing.
 */
const TRAILING_TAG = /^(?:(.*?)\s+)?#([^\s#]*)$/;

export function parseTodoInput(rest: string): TodoDraft {
  const input = rest.trim();
  if (!input) return { kind: "empty" };

  const tagged = TRAILING_TAG.exec(input);
  if (!tagged) return { kind: "create", text: input, tag: "" };

  const text = (tagged[1] ?? "").trim();
  const tag = tagged[2];
  if (!text) return { kind: "filter", tag };
  return { kind: "create", text, tag };
}

/**
 * The label the query is filtered to, or empty when it filters nothing.
 *
 * A line being typed as a new todo filters nothing: the list behind it should
 * stay the whole list until the item exists. Only a line that is purely a label
 * narrows anything — and `todo #` narrows nothing either, which is how the panel
 * tells "show me the labels" from "show me this one".
 */
export function filterTagOf(rest: string): string {
  const draft = parseTodoInput(rest);
  return draft.kind === "filter" ? draft.tag : "";
}

/**
 * True while the query is naming a label the list does not hold.
 *
 * `todo #购` is not a filter, it is the beginning of a label. A filter that
 * matches nothing is a dead end the user has to back out of; the list of labels
 * that do match is the thing they were reaching for. This is also what makes
 * `todo #` mean "show me the labels", since an empty label is held by nobody.
 */
export function isBrowsingTags(rest: string, known: (tag: string) => boolean): boolean {
  const draft = parseTodoInput(rest);
  return draft.kind === "filter" && !known(draft.tag);
}
