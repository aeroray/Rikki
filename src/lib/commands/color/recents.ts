import type { ClipboardEntry } from "$lib/commands/types";
import { parseColor, type ParsedColor } from "./parse";

const RECENT_LIMIT = 10;

export function recentColors(entries: ClipboardEntry[], limit = RECENT_LIMIT): ParsedColor[] {
  const seen = new Set<string>();
  const colors: ParsedColor[] = [];
  for (const entry of entries) {
    if (entry.type !== "text") continue;
    if (entry.isColor === false) continue;
    const parsed = parseColor(entry.content);
    if (!parsed) continue;
    const key = colorKey(parsed);
    if (seen.has(key)) continue;
    seen.add(key);
    colors.push(parsed);
    if (colors.length >= limit) break;
  }
  return colors;
}

function colorKey(color: ParsedColor): string {
  const { r, g, b, a } = color.rgba;
  return `${r},${g},${b},${Math.round(a * 255)}`;
}
