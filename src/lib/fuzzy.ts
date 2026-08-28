import { pinyinMatchScore } from "$lib/pinyinApps";

const PREFIX_BONUS = 100;
const TITLE_BONUS = 80;
const CONTAINS_SCORE = 50;

export function fuzzyScore(query: string, text: string): number {
  const q = query.trim().toLowerCase();
  const t = text.toLowerCase();
  if (!q) return 0;
  if (t === q) return PREFIX_BONUS + 20;
  if (t.startsWith(q)) return PREFIX_BONUS - Math.min(t.length - q.length, 40);
  if (t.includes(q)) return CONTAINS_SCORE - Math.min(t.indexOf(q), 20);

  let ti = 0;
  let hits = 0;
  for (const ch of q) {
    const found = t.indexOf(ch, ti);
    if (found === -1) return 0;
    hits += 1;
    ti = found + 1;
  }
  return Math.max(1, Math.round((hits / t.length) * 40));
}

export function rankText(query: string, prefix: string, title: string): number {
  const prefixScore = fuzzyScore(query, prefix);
  const titleScore = fuzzyScore(query, title);
  if (prefixScore === 0 && titleScore === 0) return 0;
  return Math.max(prefixScore, titleScore === 0 ? 0 : titleScore + TITLE_BONUS - PREFIX_BONUS);
}

export function latinInitials(name: string): string {
  const parts = name.split(/[\s._-]+/).filter(Boolean);
  if (parts.length < 2) return "";
  const chars = parts.map((part) => part[0] ?? "").join("");
  if (![...chars].every((ch) => /[a-zA-Z0-9]/i.test(ch))) return "";
  return chars.toLowerCase();
}

const USAGE_CAP = 50;

export function rankApp(
  query: string,
  name: string,
  alias: string,
  usageCount = 0,
): number {
  const initials = latinInitials(name);
  const match = Math.max(
    fuzzyScore(query, name),
    fuzzyScore(query, alias),
    initials ? fuzzyScore(query, initials) : 0,
    pinyinMatchScore(query, name),
  );
  if (match <= 0) return 0;
  return match + Math.min(Math.max(usageCount, 0), USAGE_CAP);
}
