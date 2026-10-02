/**
 * What the user typed after `shutdown` or `reboot`, turned into a delay.
 *
 * Everything here is a *delay in seconds*, never a wall-clock time: the OS timers
 * both platforms use count down, and "23:00" is only meaningful once it has been
 * resolved against the current clock — which has to happen at the moment the user
 * commits, not when they started typing.
 */

/** The preset ids, which are also the tail of their i18n keys. */
export type PresetId = "now" | "15m" | "30m" | "1h" | "2h" | "4h";

/** One option the panel offers, and what the arrows walk. */
export type DelayOption = {
  /** `typed` for a value that was entered, otherwise a preset id. */
  id: PresetId | "typed";
  /** Seconds from now. */
  seconds: number;
  /** A label already resolved against the clock, e.g. `23:00` or `30 分钟`. */
  detail: string;
};

/**
 * Presets, in the order the panel shows them.
 *
 * `now` leads, at zero seconds, so the immediate action is still reachable — it was
 * the only behaviour before this panel existed, and losing it would be a
 * regression. It is the one row that needs a confirmation, because a delay can be
 * cancelled and this cannot.
 */
const PRESETS: Array<{ id: PresetId; seconds: number }> = [
  { id: "now", seconds: 0 },
  { id: "15m", seconds: 15 * 60 },
  { id: "30m", seconds: 30 * 60 },
  { id: "1h", seconds: 60 * 60 },
  { id: "2h", seconds: 2 * 60 * 60 },
  { id: "4h", seconds: 4 * 60 * 60 },
];

/**
 * A duration, or a time of day.
 *
 * Accepted: `30` `30m` `1h` `1h30m` `90min` `2h` `23:00` `23:00:00` `7:30`.
 *
 * A bare number is read as minutes, which is the unit people mean when they say
 * "shut down in 30" — and it matches the presets, so the typed and the clicked
 * paths agree. `hh:mm` is a time of day, resolved to the next time it occurs, so
 * `23:00` after 23:00 means tomorrow.
 */
export function parseDelay(input: string, now: Date = new Date()): number | null {
  const value = input.trim().toLowerCase();
  if (!value) return null;

  const clock = value.match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?$/);
  if (clock) {
    const hours = Number(clock[1]);
    const minutes = Number(clock[2]);
    const seconds = clock[3] ? Number(clock[3]) : 0;
    if (hours > 23 || minutes > 59 || seconds > 59) return null;
    const target = new Date(now);
    target.setHours(hours, minutes, seconds, 0);
    // Already past today means tomorrow, not a negative delay.
    if (target.getTime() <= now.getTime()) target.setDate(target.getDate() + 1);
    return Math.round((target.getTime() - now.getTime()) / 1000);
  }

  // `1h30m`, `90min`, `2h`, `45s`. Each unit is optional and may repeat in any
  // order, so `30m1h` works too — refusing it would be pedantry, not safety.
  //
  // `(?![a-z])` rather than `\b`: a word boundary does not exist between `h` and
  // `3` in `1h30m`, because both are word characters, so the unit would never match
  // and every combined form was rejected. The lookahead says the same thing —
  // "the unit ends here" — without requiring a non-word character, which a digit
  // is not.
  const units = [...value.matchAll(/(\d+(?:\.\d+)?)\s*(hours?|hrs?|h|minutes?|mins?|m|seconds?|secs?|s)(?![a-z])/g)];
  if (units.length > 0 && units.map((match) => match[0]).join("").replace(/\s/g, "") === value.replace(/\s/g, "")) {
    let total = 0;
    for (const match of units) {
      const amount = Number(match[1]);
      const unit = match[2];
      if (unit.startsWith("h")) total += amount * 3600;
      else if (unit.startsWith("s")) total += amount;
      else total += amount * 60;
    }
    return total > 0 ? Math.round(total) : null;
  }

  // A bare number is minutes.
  const bare = value.match(/^(\d+(?:\.\d+)?)$/);
  if (bare) {
    const minutes = Number(bare[1]);
    return minutes > 0 ? Math.round(minutes * 60) : null;
  }

  return null;
}

/**
 * The options the panel lists: the presets, plus whatever the query parses to when
 * it is not one of them.
 *
 * A typed value leads the list rather than being appended, because the user who
 * typed something specific is the one who wants it, and Enter takes the first row.
 */
export function delayOptions(query: string, now: Date = new Date()): DelayOption[] {
  const presets: DelayOption[] = PRESETS.map((preset) => ({
    id: preset.id,
    seconds: preset.seconds,
    detail: clockOf(now, preset.seconds),
  }));

  const trimmed = query.trim();
  if (!trimmed) return presets;

  const parsed = parseDelay(trimmed, now);
  // Nothing recognised: the presets are still the useful answer, and the footer
  // says the text was not understood rather than pretending it was.
  if (parsed === null) return presets;
  if (presets.some((preset) => preset.seconds === parsed)) return presets;

  return [
    { id: "typed", seconds: parsed, detail: clockOf(now, parsed) },
    ...presets,
  ];
}

/**
 * The wall-clock time a delay lands on, which is what makes a countdown legible:
 * "2 小时" is harder to place than "14:30".
 *
 * Zero seconds is "now", which has no time to name — the label says it instead.
 */
export function clockOf(now: Date, seconds: number): string {
  if (seconds <= 0) return "";
  const at = new Date(now.getTime() + seconds * 1000);
  const hours = String(at.getHours()).padStart(2, "0");
  const minutes = String(at.getMinutes()).padStart(2, "0");
  return `${hours}:${minutes}`;
}

/**
 * A delay as words, for the footer's countdown.
 *
 * Seconds are shown only under a minute, where they are the only unit that moves.
 * The key is a literal union rather than `string` so the caller can pass it
 * straight to `i18n.t`, whose catalog is typed and rejects an unverifiable key.
 */
export function describeDelay(seconds: number): {
  key: "power.inSeconds" | "power.inMinutes" | "power.inHours" | "power.inHoursMinutes";
  params: Record<string, number>;
} {
  if (seconds < 60) return { key: "power.inSeconds", params: { seconds } };
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return { key: "power.inMinutes", params: { minutes } };
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  if (rest === 0) return { key: "power.inHours", params: { hours } };
  return { key: "power.inHoursMinutes", params: { hours, minutes: rest } };
}
