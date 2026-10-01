import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { en } from "$lib/i18n/en";
import { zhCN } from "$lib/i18n/zh-CN";

/**
 * The catalogs are the whole of the interface's wording, so the two things the
 * type system cannot see are checked here: a key that one language has and the
 * other does not (which `Record<MessageKey, string>` catches in one direction
 * only), and a key that nothing reads any more — the rule the project states is
 * zero of those, and a removed panel is exactly how one appears.
 */
function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((entry) => {
    const path = join(dir, entry);
    if (statSync(path).isDirectory()) return sourceFiles(path);
    return /\.(ts|svelte)$/.test(path) ? [path] : [];
  });
}

const src = fileURLToPath(new URL("../../../src", import.meta.url));
const keys = new Set(Object.keys(zhCN));

describe("the message catalogs", () => {
  it("carry the same keys in both languages", () => {
    expect(Object.keys(zhCN).sort()).toEqual(Object.keys(en).sort());
  });

  it("has no key that nothing reads", () => {
    const unused = new Set(keys);
    for (const file of sourceFiles(src)) {
      // The catalogs themselves are where the keys are declared, not used.
      if (/i18n[\\/](zh-CN|en)\.ts$/.test(file)) continue;
      const text = readFileSync(file, "utf8");
      for (const match of text.matchAll(/i18n\.t\("([^"]+)"/g)) unused.delete(match[1]);
      // Keys also reach `t` through maps — `engines.ts`, `emoji/categories.ts`,
      // the translate label tables — as `MessageKey` values rather than calls.
      for (const match of text.matchAll(/"([a-z][A-Za-z]*\.[A-Za-z0-9_.]+)"/g)) {
        if (keys.has(match[1])) unused.delete(match[1]);
      }
    }
    expect([...unused]).toEqual([]);
  });
});
