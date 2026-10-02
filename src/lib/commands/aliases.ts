/**
 * Everything a command answers to besides its `prefix`.
 *
 * This lives in one table rather than beside each command because it is a single
 * vocabulary: what matters is that it stays unambiguous across all of them, and
 * that is only reviewable when the whole set is visible at once. A test asserts
 * that every command has an entry and that no two commands claim the same alias.
 *
 * Two reasons a command needs more than its Latin prefix:
 *
 *  - Chinese users usually have an IME active. While it composes, the search box
 *    holds the *pinyin*, so `rankCommand` also scores `pinyin-pro` against the
 *    Chinese names — `wnl`, `wannianli` and `chongqi` all find their command
 *    without the characters ever being committed. The Chinese names below are
 *    what feeds that, which is why a command whose Chinese name differs from the
 *    words users actually say needs the alternative spelling too (`日历` as well
 *    as `万年历`).
 *  - The committed characters have to work as well, since that is what ends up
 *    in the box once the IME is done.
 *
 * Latin entries are only added where the canonical prefix is long or arbitrary;
 * the prefix itself stays the primary spelling.
 */
export const COMMAND_ALIASES: Record<string, string[]> = {
  anniversary: ["anniversary", "days", "纪念日", "倒计时"],
  calendar: ["calendar", "date", "万年历", "日历"],
  calc: ["计算器", "计算"],
  clip: ["剪贴板", "剪切板"],
  color: ["clr", "颜色"],
  emoji: ["emoji", "表情"],
  json: ["jsonf", "格式化"],
  qr: ["qrcode", "二维码"],
  qrdecode: ["qrdecode", "scan", "识码", "扫码"],
  settings: ["set", "设置", "配置", "preferences"],
  snippet: ["snip", "片段", "常用语"],
  // The system monitor. Its prefix is `sys` and its title is 系统状态, so the words
  // people would actually type are here. They were missing until now, and so was
  // the command itself from `aliases.test.ts` — a command nobody imports is a
  // command the coverage check cannot miss, which is how it went unnoticed.
  sysmon: ["monitor", "系统", "系统状态", "监控", "性能"],
  timestamp: ["timestamp", "时间戳"],
  todo: ["待办", "待办事项"],
  translate: ["translate", "翻译"],
  base64: ["base64", "b64e", "encode", "编码"],
  base64d: ["base64d", "decode", "解码"],
  lock: ["锁屏"],
  sleep: ["休眠", "睡眠"],
  shutdown: ["关机"],
  reboot: ["restart", "重启"],
  logout: ["signout", "注销"],
  "web-gg": ["谷歌"],
  "web-bd": ["百度"],
  "web-bing": ["必应"],
  // No Chinese name to add; the spelled-out engine is the only other thing
  // anyone would type.
  "web-ddg": ["duckduckgo"],
  "web-sogou": ["搜狗"],
};

/**
 * The extra names for a command. Returns an empty array for a command with no
 * entry, so a new command works from its prefix alone before its vocabulary is
 * filled in.
 */
export function aliasesFor(id: string): string[] {
  return COMMAND_ALIASES[id] ?? [];
}
