export type TimestampInspect =
  | {
      ok: true;
      kind: "from-unix";
      unit: "s" | "ms";
      unixSeconds: number;
      unixMs: number;
      local: string;
      utc: string;
      copy: string;
    }
  | {
      ok: true;
      kind: "from-date";
      input: string;
      unixSeconds: number;
      unixMs: number;
      local: string;
      utc: string;
      copy: string;
    }
  | { ok: false; empty: true }
  | { ok: false; empty?: false };

const NOW_WORDS = /^(今天|今日|now|today)$/i;
const DATE_TIME =
  /^(\d{4})[-/](\d{1,2})[-/](\d{1,2})(?:[ T](\d{1,2}):(\d{2})(?::(\d{2}))?)?$/;
const ZONED_DATE_TIME =
  /^(\d{4})[-/](\d{1,2})[-/](\d{1,2})(?:[ T](\d{1,2}):(\d{2})(?::(\d{2}))?)?\s*(Z|[+-]\d{2}:\d{2})$/i;

export function inspectTimestamp(input: string, now = Date.now()): TimestampInspect {
  const text = input.trim();
  if (!text) return { ok: false, empty: true };
  if (NOW_WORDS.test(text)) return fromDate(new Date(now), text);
  if (/^\d+$/.test(text)) return fromUnixDigits(text);
  const date = parseDateTime(text);
  if (!date) return { ok: false };
  return fromDate(date, text);
}

function fromUnixDigits(digits: string): TimestampInspect {
  if (digits.length === 13) {
    const ms = Number(digits);
    if (!Number.isSafeInteger(ms)) return { ok: false };
    return fromUnix(ms, "ms");
  }
  if (digits.length === 10) {
    const seconds = Number(digits);
    if (!Number.isSafeInteger(seconds)) return { ok: false };
    return fromUnix(seconds * 1000, "s");
  }
  return { ok: false };
}

function fromUnix(ms: number, unit: "s" | "ms"): TimestampInspect {
  const date = new Date(ms);
  if (Number.isNaN(date.getTime())) return { ok: false };
  const local = formatDateTime(date, "local");
  return {
    ok: true,
    kind: "from-unix",
    unit,
    unixSeconds: Math.floor(ms / 1000),
    unixMs: ms,
    local,
    utc: formatDateTime(date, "utc"),
    copy: local,
  };
}

function fromDate(date: Date, input: string): TimestampInspect {
  if (Number.isNaN(date.getTime())) return { ok: false };
  const ms = date.getTime();
  return {
    ok: true,
    kind: "from-date",
    input,
    unixSeconds: Math.floor(ms / 1000),
    unixMs: ms,
    local: formatDateTime(date, "local"),
    utc: formatDateTime(date, "utc"),
    copy: String(Math.floor(ms / 1000)),
  };
}

function parseDateTime(input: string): Date | null {
  const trimmed = input.trim();

  const zoned = ZONED_DATE_TIME.exec(trimmed);
  if (zoned) return fromZonedMatch(zoned);

  const match = DATE_TIME.exec(trimmed);
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const hour = match[4] ? Number(match[4]) : 0;
  const minute = match[5] ? Number(match[5]) : 0;
  const second = match[6] ? Number(match[6]) : 0;
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;
  const date = new Date(year, month - 1, day, hour, minute, second);
  if (
    date.getFullYear() !== year ||
    date.getMonth() !== month - 1 ||
    date.getDate() !== day ||
    date.getHours() !== hour ||
    date.getMinutes() !== minute ||
    date.getSeconds() !== second
  ) {
    return null;
  }
  return date;
}

/// Handles `…Z` / `…+08:00`. The fields are validated the same way as the local
/// path: passing the string straight to `new Date()` used to accept impossible
/// dates and roll them over (`2024-02-31T00:00:00Z` silently became 2024-03-02).
function fromZonedMatch(match: RegExpExecArray): Date | null {
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const hour = match[4] ? Number(match[4]) : 0;
  const minute = match[5] ? Number(match[5]) : 0;
  const second = match[6] ? Number(match[6]) : 0;
  const offset = match[7] ?? "";
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;
  if (hour > 23 || minute > 59 || second > 59) return null;

  const offsetMinutes = offsetMinutesFor(offset);
  if (offsetMinutes === null) return null;

  const utc = new Date(
    Date.UTC(year, month - 1, day, hour, minute, second) - offsetMinutes * 60_000,
  );
  if (Number.isNaN(utc.getTime())) return null;
  // Round-trip through the same offset: overflow such as Feb 31 shows up here.
  const shifted = new Date(utc.getTime() + offsetMinutes * 60_000);
  if (
    shifted.getUTCFullYear() !== year ||
    shifted.getUTCMonth() !== month - 1 ||
    shifted.getUTCDate() !== day ||
    shifted.getUTCHours() !== hour ||
    shifted.getUTCMinutes() !== minute ||
    shifted.getUTCSeconds() !== second
  ) {
    return null;
  }
  return utc;
}

function offsetMinutesFor(offset: string): number | null {
  if (offset === "" || offset.toUpperCase() === "Z") return 0;
  const match = /^([+-])(\d{2}):(\d{2})$/.exec(offset);
  if (!match) return null;
  const hours = Number(match[2]);
  const minutes = Number(match[3]);
  if (hours > 23 || minutes > 59) return null;
  const sign = match[1] === "-" ? -1 : 1;
  return sign * (hours * 60 + minutes);
}

function formatDateTime(date: Date, zone: "local" | "utc"): string {
  const y = zone === "utc" ? date.getUTCFullYear() : date.getFullYear();
  const month = (zone === "utc" ? date.getUTCMonth() : date.getMonth()) + 1;
  const day = zone === "utc" ? date.getUTCDate() : date.getDate();
  const hour = zone === "utc" ? date.getUTCHours() : date.getHours();
  const minute = zone === "utc" ? date.getUTCMinutes() : date.getMinutes();
  const second = zone === "utc" ? date.getUTCSeconds() : date.getSeconds();
  return `${y}-${pad(month)}-${pad(day)} ${pad(hour)}:${pad(minute)}:${pad(second)}`;
}

function pad(value: number): string {
  return String(value).padStart(2, "0");
}
