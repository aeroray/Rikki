import baidu from "@iconify-icons/cib/baidu";
import bing from "@iconify-icons/cib/bing";
import duckduckgo from "@iconify-icons/cib/duckduckgo";
import google from "@iconify-icons/cib/google";
import sogou from "@iconify-icons/cib/sogou";

/** One icon as `@iconify-icons` publishes it, where the axes are optional. */
type IconData = typeof google;

/** A mark, reduced to the fields that draw it. */
export type EngineMark = {
  body: string;
  width: number;
  height: number;
};

/**
 * The mark each built-in engine is searched with.
 *
 * CoreUI Brands is the only set found that carries all five. Simple Icons is
 * the obvious source — it is what its Svelte wrappers are built from — but it
 * has no Bing at all, so a mark for that engine cannot come from there.
 *
 * Each body is a single path that already fills with `currentColor`, which is
 * what lets the mark take the colour of the field it sits in. The dark palette
 * and `design/DESIGN.md` leave no room for a full-colour logo.
 */
const MARKS = new Map<string, EngineMark>([
  ["baidu", sized(baidu)],
  ["bing", sized(bing)],
  ["duckduckgo", sized(duckduckgo)],
  ["google", sized(google)],
  ["sogou", sized(sogou)],
]);

function sized(icon: IconData): EngineMark {
  const width = icon.width ?? icon.height ?? 24;
  return { body: icon.body, width, height: icon.height ?? width };
}

/**
 * The mark for an engine, or `undefined` for one that has none.
 *
 * A custom engine is a URL the user typed, so it has no brand and the search
 * field keeps its magnifier.
 */
export function engineMark(engineId: string): EngineMark | undefined {
  return MARKS.get(engineId);
}
