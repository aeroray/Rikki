export type JsonError = {
  message: string;
  line: number;
  column: number;
};

export type JsonInspect =
  | { ok: true; pretty: string; compact: string; htmlPretty: string; htmlCompact: string }
  | { ok: false; empty: true }
  | { ok: false; empty?: false; error: JsonError };

export function inspectJson(input: string): JsonInspect {
  if (!input.trim()) return { ok: false, empty: true };
  try {
    const value = JSON.parse(input) as unknown;
    const pretty = JSON.stringify(value, null, 2);
    const compact = JSON.stringify(value);
    return {
      ok: true,
      pretty,
      compact,
      // Lazy: the panel renders exactly one of the two views, and building both
      // highlight trees on every keystroke doubled the cost for large documents.
      get htmlPretty() {
        return highlightValue(value, 2, 0);
      },
      get htmlCompact() {
        return highlightValue(value, 0, 0);
      },
    };
  } catch (err) {
    return { ok: false, error: locateError(input, err) };
  }
}

export function outputJson(input: string, compact: boolean): string | null {
  const inspected = inspectJson(input);
  if (!inspected.ok) return null;
  return compact ? inspected.compact : inspected.pretty;
}

function locateError(input: string, err: unknown): JsonError {
  const message = err instanceof Error ? err.message : String(err);
  const position = message.match(/position\s+(\d+)/i);
  if (position) {
    return positionToLine(input, Number(position[1]), message);
  }
  const lineCol = message.match(/line\s+(\d+)\s+column\s+(\d+)/i);
  if (lineCol) {
    return { message, line: Number(lineCol[1]), column: Number(lineCol[2]) };
  }
  return { message, line: 0, column: 0 };
}

function positionToLine(input: string, index: number, message: string): JsonError {
  const clamped = Math.min(Math.max(0, index), input.length);
  const lines = input.slice(0, clamped).split("\n");
  return {
    message,
    line: lines.length,
    column: (lines.at(-1) ?? "").length + 1,
  };
}

function highlightValue(value: unknown, indent: number, level: number): string {
  if (value === null) return wrap("null", "json-null");
  if (typeof value === "boolean") return wrap(String(value), "json-boolean");
  if (typeof value === "number") return wrap(String(value), "json-number");
  if (typeof value === "string") return wrap(escapeHtml(JSON.stringify(value)), "json-string");
  if (Array.isArray(value)) return highlightArray(value, indent, level);
  if (typeof value === "object") return highlightObject(value as Record<string, unknown>, indent, level);
  return escapeHtml(String(value));
}

function highlightArray(value: unknown[], indent: number, level: number): string {
  if (value.length === 0) return "[]";
  if (indent === 0) {
    return `[${value.map((item) => highlightValue(item, 0, 0)).join(",")}]`;
  }
  const inner = " ".repeat(indent * (level + 1));
  const outer = " ".repeat(indent * level);
  const items = value.map((item) => `${inner}${highlightValue(item, indent, level + 1)}`).join(",\n");
  return `[\n${items}\n${outer}]`;
}

function highlightObject(value: Record<string, unknown>, indent: number, level: number): string {
  const entries = Object.entries(value);
  if (entries.length === 0) return "{}";
  const pair = ([key, nested]: [string, unknown], gap: string) =>
    `${wrap(escapeHtml(JSON.stringify(key)), "json-key")}:${gap}${highlightValue(nested, indent, indent === 0 ? 0 : level + 1)}`;
  if (indent === 0) {
    return `{${entries.map((entry) => pair(entry, "")).join(",")}}`;
  }
  const inner = " ".repeat(indent * (level + 1));
  const outer = " ".repeat(indent * level);
  const items = entries.map((entry) => `${inner}${pair(entry, " ")}`).join(",\n");
  return `{\n${items}\n${outer}}`;
}

function wrap(text: string, className: string): string {
  return `<span class="${className}">${text}</span>`;
}

function escapeHtml(text: string): string {
  return text
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}
