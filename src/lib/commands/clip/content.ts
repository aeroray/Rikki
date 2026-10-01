import type { ClipboardEntry } from "$lib/commands/types";
import { parseColor } from "$lib/commands/color/parse";
import { fuzzyScore } from "$lib/fuzzy";

/**
 * Reading a clip body: what kind it is, whether it matches a query, and what a
 * row shows of it.
 *
 * Everything here is a pure function of the stored body, because a body can be
 * half a megabyte and the answers are needed per entry per keystroke. That is
 * the rule the bounds below follow: nothing in this file copies a whole body to
 * answer a question about its first few hundred characters.
 */

/**
 * What a clip row is, as far as its icon and its meta line are concerned.
 *
 * `text` and `multiline` are the two that mean "nothing more specific": a body
 * with a line break in it is a block, and everything else that is not a colour,
 * a link, an address or a path is a line of text.
 */
export type ClipKind =
  | "image"
  | "files"
  | "color"
  | "url"
  | "email"
  | "path"
  | "multiline"
  | "text";

/**
 * How much of a body the classifier looks at.
 *
 * A colour, a link, an address and a path are all short, and this runs per entry
 * per keystroke, so `trim()` — which copies the whole string — must not be
 * handed half a megabyte of log.
 */
const PROBE = 2048;

/** Nothing longer than this is a colour, so the parse is not attempted. */
const COLOR_MAX = 64;

/** How much of a body a row reads for its preview, and how much it shows. */
const PREVIEW_WINDOW = 400;
const PREVIEW_SCAN = 4000;

const URL = /^https?:\/\/\S+$/i;
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
/** `C:\…` or `C:/…`. Unambiguous, so spaces are allowed after the drive. */
const WINDOWS_PATH = /^[a-z]:[\\/]/i;
/** `\\server\share`. */
const UNC_PATH = /^\\\\[^\\\s]/;
/** `~/…`, the shell's own spelling of a home path. */
const HOME_PATH = /^~\/[^\s/]+/;
/**
 * `/a/b`, at least two segments and no whitespace.
 *
 * Deliberately strict: `/help` and `// a comment` are text, and a Unix path with
 * a space in it reads as text rather than the other way round, because a body
 * mistaken for a path loses its real preview.
 */
const POSIX_PATH = /^\/(?:[^\s/]+\/)+[^\s/]*$/;

export function clipKind(entry: ClipboardEntry): ClipKind {
  if (entry.type === "image") return "image";
  if (entry.type === "files") return "files";

  const content = entry.content;
  if (content.length > PROBE) {
    // Too long to be any of the specific kinds below, and the only question left
    // is whether it is one line or a block.
    return content.includes("\n") ? "multiline" : "text";
  }

  const text = content.trim();
  if (!text) return "text";
  if (text.length <= COLOR_MAX && parseColor(text)) return "color";
  if (!text.includes("\n")) {
    if (URL.test(text)) return "url";
    if (EMAIL.test(text)) return "email";
    if (isPath(text)) return "path";
  }
  return text.includes("\n") ? "multiline" : "text";
}

function isPath(text: string): boolean {
  return (
    WINDOWS_PATH.test(text) || UNC_PATH.test(text) || HOME_PATH.test(text) || POSIX_PATH.test(text)
  );
}

/**
 * Words that find a kind whose body cannot be searched for it.
 *
 * An image's body is a hashed file name and a copied file's body is a list of
 * paths, so "image" and "文件" have to be added to the haystack or there is no
 * way to ask for those rows. The other kinds are left out on purpose: a keyword
 * on every text row would make `fuzzyScore` answer "contains" for almost any
 * query, and every row would score the same.
 */
const KIND_KEYWORDS: Partial<Record<ClipKind, string>> = {
  image: "图片 image png 截图 screenshot",
  files: "文件 files folder 文件夹",
  url: "链接 link url",
  email: "邮箱 mail email",
  path: "路径 path folder 文件夹",
  color: "颜色 color",
};

/**
 * Whether a row matches what the search field holds.
 *
 * The kind's keywords are scored separately from the body rather than prefixed
 * onto it: concatenating them would copy the body on every keystroke, which is
 * the one thing this has to avoid for a long clip.
 */
export function matchesClipQuery(entry: ClipboardEntry, query: string): boolean {
  const keywords = KIND_KEYWORDS[clipKind(entry)];
  if (keywords && fuzzyScore(query, keywords) > 0) return true;

  if (entry.type === "image") {
    // The path is a hash, so it is not part of the haystack; the dimensions and
    // the app it came from are.
    const dims = entry.width && entry.height ? `${entry.width}x${entry.height}` : "";
    return fuzzyScore(query, `${dims} ${entry.appName}`) > 0;
  }
  return fuzzyScore(query, entry.content) > 0 || fuzzyScore(query, entry.appName) > 0;
}

/**
 * The one-line preview a row shows of a body.
 *
 * If the window turns out to be blank — deeply indented code, a leading blank
 * block — the scan starts at the first visible character rather than showing
 * nothing at all.
 */
export function clipPreview(content: string, chars = 60): string {
  const window = content.length > PREVIEW_WINDOW ? content.slice(0, PREVIEW_WINDOW) : content;
  const collapsed = collapse(window);
  if (collapsed || content.length <= PREVIEW_WINDOW) return clamp(collapsed, chars);
  const start = firstVisible(content);
  return clamp(collapse(content.slice(start, start + PREVIEW_WINDOW)), chars);
}

function collapse(text: string): string {
  return text.replace(/\s+/g, " ").trim();
}

function clamp(text: string, chars: number): string {
  return text.length > chars ? `${text.slice(0, chars)}…` : text;
}

/** Where the first non-whitespace character is, or 0 when there is none nearby. */
function firstVisible(content: string): number {
  const end = Math.min(content.length, PREVIEW_SCAN);
  for (let i = 0; i < end; i += 1) {
    if (!/\s/.test(content[i] ?? "")) return i;
  }
  return 0;
}

/**
 * How many lines a body has, counting no further than `limit`.
 *
 * A clip can be half a megabyte, and `split("\n").length` would allocate an
 * array of every line just to print a number that stops being interesting well
 * before it stops being countable.
 */
export function clipLineCount(content: string, limit = 99): number {
  let lines = 1;
  for (let i = 0; i < content.length; i += 1) {
    if (content.charCodeAt(i) !== 10) continue;
    lines += 1;
    if (lines > limit) return lines;
  }
  return lines;
}

/** The paths a `files` entry holds, in the order they were copied. */
export function clipFilePaths(entry: ClipboardEntry): string[] {
  if (entry.type !== "files") return [];
  return entry.content.split("\n").filter(Boolean);
}

/** The last segment of a path, whichever separator it uses. */
export function clipFileName(path: string): string {
  const parts = path.split(/[\\/]/).filter(Boolean);
  return parts[parts.length - 1] ?? path;
}
