export type SnippetAction =
  | { type: "add" }
  | { type: "edit"; query: string }
  | { type: "search"; query: string };

function takeWord(input: string, word: string): string | null {
  const lower = input.trimStart().toLowerCase();
  if (lower === word) return "";
  if (lower.startsWith(`${word} `) || lower.startsWith(`${word}\t`)) {
    return input.trimStart().slice(word.length).trimStart();
  }
  return null;
}

export function parseSnippetAction(rest: string): SnippetAction {
  if (takeWord(rest, "add") !== null) return { type: "add" };

  const editRest = takeWord(rest, "edit");
  if (editRest !== null) {
    return { type: "edit", query: editRest.trim() };
  }

  return { type: "search", query: rest };
}

export function snippetListQuery(rest: string): string {
  const action = parseSnippetAction(rest);
  if (action.type === "search") return action.query;
  if (action.type === "edit") return action.query;
  return "";
}
