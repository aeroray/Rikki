import { match } from "pinyin-pro";

const HAN = /[\u4e00-\u9fff]/;
const EXACT = 120;
const PREFIX = 100;
const PARTIAL = 50;

export function pinyinMatchScore(query: string, name: string): number {
  const q = query.trim();
  if (!q || !HAN.test(name)) return 0;
  const hits = match(name, q, {
    precision: "start",
    lastPrecision: "start",
    continuous: false,
    space: "ignore",
    insensitive: true,
    v: true,
  });
  if (!hits?.length) return 0;
  let zh = 0;
  for (const ch of name) {
    if (HAN.test(ch)) zh += 1;
  }
  if (zh === 0) return 0;
  const coverage = hits.length / zh;
  if (coverage >= 1) return EXACT;
  if (hits[0] === firstHanIndex(name)) {
    return PREFIX - Math.min(Math.round((1 - coverage) * 40), 40);
  }
  return Math.max(1, Math.round(coverage * PARTIAL));
}

function firstHanIndex(name: string): number {
  for (let i = 0; i < name.length; i += 1) {
    if (HAN.test(name[i] ?? "")) return i;
  }
  return 0;
}
