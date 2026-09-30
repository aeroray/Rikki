# Rikki 深度代码审查报告

- 日期：2026-09-24
- 范围：全部前端（`src/`，约 90 个文件）与 Rust 后端（`src-tauri/src/`，25 个文件）、构建与权限配置
- 方法：逐文件精读 + 三个子代理分区只读复审 + 对每条结论做可执行验证（Node 脚本跑真实依赖、`rustc` 探测平台语义、`cargo test`）
- 结果：**修复 31 项**（Rust 12 项 / 前端 19 项），**保留 12 项建议**并说明理由；`svelte-check` 0 error 0 warning，`cargo test --lib` 45 passed，`pnpm build` 通过，i18n 293/293 键对齐

---

## 一、结论摘要

| 严重度 | 数量 | 已修复 | 保留建议 |
| --- | --- | --- | --- |
| Critical（数据丢失 / 静默错误） | 3 | 3 | 0 |
| High（功能正确性 / 安全加固） | 6 | 3 | 3 |
| Medium（健壮性 / 性能 / 可访问性） | 14 | 11 | 3 |
| Low（代码质量 / 一致性） | 12 | 6 | 6 |

没有发现注入类漏洞：全库仅两处 `{@html}`（JSON 高亮、二维码 SVG），前者对 key/value 做了 `& < > "` 转义，后者由 `qrcode` 库生成且不回显用户文本；`searchUrl` 两条路径都用 `encodeURIComponent`；正则无灾难性回溯。

---

## 二、Critical（已全部修复）

### C1. 存储层「先删后改名」存在数据真空窗口
**位置**：`src-tauri/src/storage/settings_store.rs`、`todo_store.rs`、`usage_store.rs`、`clipboard_store.rs`、`calc_history.rs`、`snippet_store.rs`、`src-tauri/src/apps.rs`（共 7 处重复实现）

```rust
fs::write(&tmp, data)?;
if path.exists() { fs::remove_file(&path)?; }   // ← 删除与改名之间文件不存在
fs::rename(&tmp, &path)?;
```
**影响**：`remove_file` 与 `rename` 之间进程被终止或断电，原文件已消失、临时文件未上位 → 该文件全部数据丢失。7 处存储全部命中（包括 `settings.json` 与全部剪贴板历史）。

**验证**：写了一个 `rustc` 探针确认 `std::fs::rename` 在 Windows 上会直接覆盖已存在的目标（std 使用 `MoveFileExW` + `MOVEFILE_REPLACE_EXISTING`），因此那句 `remove_file` 既无必要又有害。

**修复**：新增 `src-tauri/src/storage/json_file.rs`，统一为 `write(tmp) → fs::rename(tmp, target)`，并配套 4 个单元测试。7 处存储全部改为调用该 helper。

### C2. `settings.json` 一旦损坏，设置将永久无法保存且不修复
**位置**：`src-tauri/src/storage/settings_store.rs:243-261`（原 `load_settings`）

**影响**：`load_settings` 每次重新解析都失败 → 之后每一次 `update_setting` 都返回 Err → 前端 `patch()` 静默 `return false`。用户此后再也改不了任何设置（含热键、翻译凭据），自定义搜索引擎从 UI 消失，且没有任何提示。

**修复**：`read_json` 在解析失败时把文件改名为 `settings.json.corrupt-<epoch>` 保留证据，`load_settings` 随即重建默认值并落盘 —— 损坏后第一次调用即自愈。`usage_count.json` 原先用 `unwrap_or_default()` 静默归零并固化，现在同样先隔离坏文件；`apps.json` 是缓存，损坏时回退到重新扫描而不是让整条命令失败。

### C3. 带时区的时间戳绕过校验，静默产出错误日期
**位置**：`src/lib/commands/timestamp/parse.ts:86-89`（原代码）

```ts
if (/Z$/i.test(trimmed) || /[+-]\d{2}:\d{2}$/.test(trimmed)) {
  const parsed = new Date(trimmed);   // ← 宽松解析，完全跳过字段校验
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}
```
**实测**（Node）：

| 输入 | 修复前 | 修复后 |
| --- | --- | --- |
| `2024-02-31T00:00:00Z` | `2024-03-02`（静默归一） | 拒绝 |
| `1Z` | `2001-01-01` | 拒绝 |
| `2024-02-31`（无 Z） | 拒绝 | 拒绝（不变） |

**影响**：`inspectTimestamp` 返回 `ok:true`，`copyTimestampResult()` 直接把错误结果复制进剪贴板；同一个非法日期在两条路径下行为相反。

**修复**：新增 `ZONED_DATE_TIME` 正则与 `fromZonedMatch()`，用显式字段 + `Date.UTC` 构造后回读校验（含时区偏移范围校验），与本地路径的严格度一致。

---

## 三、High

### H1. 粘贴图片失败时泄漏 GDI 句柄（已修复）
**位置**：`src-tauri/src/apps_icons.rs:109-156`

`CreateDIBSection(...).map_err(...)?` 在 `unsafe` 块内提前返回，导致 `hdc_screen`、`hdc`、`info.hIcon` 三个句柄全部泄漏；该函数对每个应用图标执行一次，失败会在扫描时累积。

**修复**：改为 `match`，两条路径都执行 `DeleteDC` / `ReleaseDC` / `DestroyIcon`；同时图标 PNG 改为「临时文件 + rename」写入 —— 半张写坏的 PNG 会被 `attach_icons` 当成有效缓存永久使用。

### H2. `simulate_paste` 阻塞 Tauri 主线程 220ms（已修复）
**位置**：`src-tauri/src/input.rs:10-30`

Tauri 中非 async 的 `#[tauri::command]` 在 IPC 回调线程（Windows/macOS 即 UI 主线程）上同步执行，因此每次「粘贴剪贴板记录」都会冻结窗口与 IPC 处理 220ms。

**修复**：改为 `async` + `tauri::async_runtime::spawn_blocking(paste_shortcut)`，延迟与事件顺序不变，但不再占用主线程。

### H3. pinyin 匹配对拉丁字符误判为满分（已修复）
**位置**：`src/lib/pinyinApps.ts:25-27`

`coverage = hits.length / zh` 的分子来自 `pinyin-pro` 返回的**全部**命中下标（含名字里的拉丁字符），分母只数汉字，因此 coverage 可 > 1 直接拿满分 120。

**实测**：`pinyinMatchScore("wps","微信 WPS") = 120`、`("qq","QQ 音乐") = 120` —— 一个汉字都没命中却与真正全名精确匹配同分，会压过合法的前缀命中（98）。`hits[0] === firstHanIndex(name)` 也在拿拉丁下标和汉字下标比较。

**修复**：先过滤出汉字命中再算 coverage。**回归验证**（真实 `pinyin-pro`）：

| query / name | 修复前 | 修复后 |
| --- | --- | --- |
| `wx` / `微信` | 120 | **120**（文档行为保留） |
| `zfb` / `支付宝` | 120 | **120** |
| `wx` / `微信 WPS` | 120 | **120** |
| `wps` / `微信 WPS` | 120（假） | 80（由 fuzzy 子串命中兜底，仍可搜到） |

### H4. 设置页 1.5s 定时器在隐藏后覆盖用户新输入（已修复）
**位置**：`src/lib/stores/settings.svelte.ts:460-469`

`scheduleReturn()` 的定时器只在 `cancelReturn()` 里清除，而 `settings` 的 `onHideFlush` 只注册了翻译草稿的 flush。用户在改完设置 1.5s 内按 Esc 隐藏、再唤出并开始输入，定时器触发会把查询重置为 `settings `。

**修复**：hide 回调中增加 `this.cancelReturn()`。

### H5. 翻译 API 地址非法时静默丢弃且内存与磁盘分叉（已修复）
**位置**：`src/lib/stores/settings.svelte.ts:260-279`

原代码先 `persistPending.delete(key)` 再做 URL 校验，非法值被直接 return，既不落盘也无提示，而输入框里显示的是内存值 —— 用户以为保存成功了。

**修复**：先校验、失败则 `flash` 明确提示「未保存」，不再保留待写值；同时移除「把输入框重置为默认值」的做法，避免与逐字输入互相打架。

### H6. CSP 为 null，未做防御性加固（保留建议，未改）
**位置**：`src-tauri/tauri.conf.json` → `app.security.csp: null`

**为什么没有直接改**：构建产物 `build/index.html` 含一个**无 src 的内联 `<script>`**（SvelteKit 静态构建的启动脚本），而 Tauri 只对 `script[src^='http']` 和 `<style>` 注入 nonce。因此 `script-src` 必须保留 `'unsafe-inline'`，否则窗口直接白屏。我无法在本环境验证打包后的 webview（无法交互测试），而「未经运行验证的安全配置」比「有文档的现状」更危险。

**如果要做，请用下面这份配置并逐项回归**（重点验证：剪贴板图片预览、二维码解码、字体、全局热键、托盘菜单）：

```json
"csp": "default-src 'self' ipc: http://ipc.localhost; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' asset: http://asset.localhost data: blob:; font-src 'self' data:; connect-src 'self' ipc: http://ipc.localhost asset: http://asset.localhost; object-src 'none'; base-uri 'self'; frame-ancestors 'none'"
```

其中 `asset:` 必须同时出现在 `img-src` 与 `connect-src`：`commands/qrcode/decode.ts` 的兜底路径用 `fetch()` 读 asset 图片。该决定已记入 `docs/memory/decisions.md`。

---

## 四、Medium

### M1. 剪贴板写入结果被吞掉，UI 谎报成功（已修复）
**位置**：`src/lib/stores/clipboard.svelte.ts`

`write()` 的 `catch {}` 把真实 IO 失败与「浏览器预览没有 Tauri」混为一谈；`confirmAction()` 在 `enqueueWrite()` 之后**立即** flash「已清理过期记录」，即使写盘失败。`clear()` 同理。

**修复**：`write()` 返回布尔、`enqueueWrite()` 返回该 Promise、`clear()` 改为 async 并返回结果，确认后按结果 flash「已完成」或新增的 `clip.saveFailed`。写队列仍是串行链，失败不会中断后续写入。

### M2. emoji 数据加载失败后被永久缓存（已修复）
**位置**：`src/lib/commands/emoji/data.ts:21`、`src/lib/stores/emojis.svelte.ts:69-79`

`loading ??= import(...)` 在 reject 后仍持有那个 rejected Promise，`??=` 永不重入；store 侧只有 `try/finally` 没有 `catch`，`void emojis.ensure()` 于是产生未处理 rejection，且本次会话内 emoji 面板永远打不开（同时面板会永远停在「正在加载表情…」）。

**修复**：`data.ts` 失败时清空 `loading` 并继续抛；store 捕获后 `pending = null`（下次可重试）、置 `failed` 标记并 flash 新增的 `emoji.loadFailed`；面板在 `failed` 时落到空状态而不是永久 loading 遮罩。

### M3. emoji 分类前缀匹配只认硬编码中文（已修复）
**位置**：`src/lib/commands/emoji/categories.ts:41`

前缀只比对 `category.name`（中文字面量），英文名/id 仅参与精确匹配。**实测**：`peop`/`nat`/`anim`/`fla`/`flags`/`Animals` 全部无结果，只有 `people`/`nature`/`笑脸` 可用。

**修复**：前缀匹配改为对 `categoryMatchNames()`（id + 中英标签）逐个小写比对。

### M4. 滚动条对「只改文本」的更新不重算（已修复）
**位置**：`src/lib/components/ScrollArea.svelte:113-114`

`MutationObserver` 只监听 `{childList, subtree}`。Svelte 更新纯文本走 `nodeValue` 赋值（characterData 变更），既无 childList 记录、也不改 viewport 盒模型，ResizeObserver 同样不触发 → 滑块尺寸/位置滞后到下一次滚动才自愈。

**修复**：补 `characterData: true`；顺带删除只写不读的 `recentlyScrolled` 状态及其 800ms 定时器（每次滚动都做一次无意义的状态写入）。

### M5. 组合框语义挂在错误的元素上（已修复）
**位置**：`src/lib/components/SearchBar.svelte`、`ResultList.svelte:40-42`、`EmptyState.svelte:20-22`

DOM 焦点始终在 `<input>`，但 `aria-activedescendant` 挂在不聚焦的 listbox 上（全库没有任何 `viewport.focus()`），按 ARIA 1.2 该属性会被忽略；input 又有 `aria-autocomplete`/`aria-expanded` 却缺 `role="combobox"`。

**修复**：input 增加 `role="combobox"` 与由当前视图推导的 `aria-activedescendant`；listbox 只保留 `role`/`aria-label`。

### M6. 提示行对比度不足（已修复）
**位置**：`src/app.css:78`（`.palette-hint`）

按 WCAG 公式实测：`#62666d`(ink-tertiary) 在 surface-1 `#111214` 上 3.25:1、在 canvas `#07080a` 上 3.47:1；浅色主题 `#8a8f98` 在 `#f4f5f6` 上仅 2.98:1，全部低于 12px 文本要求的 4.5:1。而 `.palette-hint` 是**几乎每个面板底部快捷键提示**的颜色。`design/DESIGN.md` 自己把 ink-subtle 标注为「Hints, icons」、ink-tertiary 标注为「Meta」。

**修复**：`.palette-hint` 改用 `var(--color-ink-subtle)`（深色 6.17:1 / 浅色 4.57:1，均达标）。**未改设计 token 本身** —— `ink-tertiary` 的值属于 `DESIGN.md` 的权威定义，其余用于 12px 元信息的场景（`ClipItem`/`CommandItem`/`EmojiPanel` 等）建议由设计侧决定是否一并调整。

### M7. listbox 直接子元素不合规（已修复）
**位置**：`commands/settings/EngineSelector.svelte`、`commands/snippet/SnippetItem.svelte`

这两个组件的根是普通 `div`，`role="option"` 的按钮在其内部，中间层会把列表在无障碍树里割裂。**核查后确认** Theme/Language/ClipRetention 三个选择器的按钮就是 viewport 的直接子级，无需修改（子代理原报告此处有误）。

**修复**：两个包装 `div` 加 `role="presentation"`。

### M8. 网格列数与键盘步长双份常量（已修复）
**位置**：`commands/emoji/EmojiGrid.svelte:9` 的 `grid-cols-12` vs `commands/emoji/categories.ts:6` 的 `EMOJI_GRID_COLS = 12`

两处独立定义，改动任一处都会让 ↑/↓ 键错位一行且无编译期报错。**修复**：网格改用 `style="grid-template-columns: repeat({EMOJI_GRID_COLS}, minmax(0, 1fr))"`，常量成为唯一来源；同时把 `aria-label="Emoji"` 换成 i18n key，并移除外层 ScrollArea 上重复的 `listbox` 语义（原本出现两个嵌套 listbox）。

### M9. 命令失败无任何反馈（已修复）
**位置**：`commands/web/index.ts:34`、`commands/sys/index.ts:17`、`commands/fallback.ts:23-25`

三处 `.catch(() => {})`：打开浏览器失败、关机/重启权限不足、兜底搜索失败时，面板既不关闭也不提示 —— 用户按 Enter 后「什么都没发生」，无法区分成功与失败（关机类操作尤其危险）。

**修复**：分别 flash `search.openFailed` / `sys.failed`。

### M10. `bump_usage` 无 catch 产生未处理 rejection（已修复）
**位置**：`src/lib/stores/ui.svelte.ts:103` — 补 `.catch()`。

### M11. 同毫秒采集会撞 id（已修复）
**位置**：`src/lib/stores/clipboard.svelte.ts` 两处 `clip_${Date.now()}`

同一毫秒内两次采集（如快速连续复制）会产生重复 id，而列表用 `(entry.id)` 作 keyed each 的 key → Svelte 抛 `each_key_duplicate`。**修复**：改用 `clip_${crypto.randomUUID()}`。

`src-tauri/src/storage/snippet_store.rs` 的 `snp_{created_at}` 同理（同毫秒创建两个片段），改为 `snp_{created_at}_{rand:04x}`。

### M12. 图片上限在「不清理」设置下没有入口（保留建议，未改）
**位置**：`src/lib/commands/clip/cleanup.ts` + `commands/settings/actions.ts`

`days <= 0` 时设置页拒绝执行清理动作。不过**子代理「图片无上限增长」的结论不成立**：`clipboard.prune()` 在每次 upsert 时都强制裁剪到 200 张（`clipboard.svelte.ts` 与 `clipboard_store.rs` 双端都做），因此图片不会无限增长。剩余问题只是「预览数与实际删除数」在 `days<=0` 时理论上不一致，而该分支当前不可达。**保留建议**：若将来增加「只清图片」入口，请把「按天过期」与「数量上限」解耦。

### M13. 长文本粘贴时匹配开销（部分修复）
**位置**：`src/lib/pinyinApps.ts`

实测：250 个中文应用名，短查询（`wx`）约 **1.7ms/次按键**（不是子代理报告的 127ms）；但 5000 字符的长查询会让单次 `pinyinMatchScore` 涨到 0.87ms × 250 ≈ 200ms+。

**修复**：`pinyinMatchScore` 增加 `q.length > 32` 护栏（对超长 query 拼音匹配本身无意义）。长文本的 `fuzzyScore` 子序列分支在首个字符失配时即返回，实测无同类问题。

### M14. 其它已修复的小项

| 位置 | 问题 | 修复 |
| --- | --- | --- |
| `commands/qr.rs:17` | `default_name` 未净化，带路径分隔符的名字会影响默认保存位置 | 取 `file_name()` 并强制 `.png` 后缀 |
| `commands/json/parse.ts:12` | `htmlPretty` 与 `htmlCompact` 每次按键都全量构建两份高亮树，而面板只渲染其中一份 | 改为惰性 getter，编辑大 JSON 的每键开销减半 |
| `commands/color/parse.ts:171` | `formatAlpha` 两个分支代码完全相同（死分支） | 简化为单行 |
| `commands/color/recents.ts:6` | `limit <= 0` 时仍返回 1 条（先 push 后比较） | 提前返回空数组 |
| `clipboard/write.ts:7` | 写入前 `trim()`，吃掉多行片段的首行缩进与末尾换行 | 只用 `trim()` 判空，写入原值 |
| `components/ResultList.svelte:27` | 点击应用启动失败时无反馈（与 SearchBar 的键盘路径不一致） | 与键盘路径统一为 flash `app.launchFailed` |
| `commands/settings/SettingsPanel.svelte:76-87`、`components/SearchBar.svelte:298-309` | 两处逐字重复的 screen→行数映射 | 抽为 `settings.countFor(screen)`；同时给 `openTranslateDraft()` 补 `untrack`，消除打字时整个设置页 effect 重跑 |
| `commands/translate/TranslatePanel.svelte:29-50` | 两份必须同步维护的错误码清单 | 合并为单一 `ERROR_KEYS` 表 |
| `src/lib/i18n/{zh-CN,en}.ts` | 硬编码字符串绕过 i18n（emoji 网格 aria-label 等） | 新增 6 个 key（含失败提示），两目录保持 293/293 对齐 |

---

## 五、Low / 保留建议（未修改，附理由）

| # | 位置 | 观察 | 为什么没改 |
| --- | --- | --- | --- |
| L1 | `src/lib/fuzzy.ts:30` | `rankText` 的 `titleScore + TITLE_BONUS - PREFIX_BONUS`（即 -20）对子序列命中（1–40 分）做偏移，≤20 的被 `Math.max(0,…)` 截成 0，而调用方以 `score > 0` 作为「无匹配」判据 —— 弱 title 命中被静默隐藏（实测 `ol` 只出 color 不出 Google、`ar` 不出 Calculator）。若要去掉这层隐式过滤，改 `return Math.max(1, Math.max(prefixScore, titleScore - (PREFIX_BONUS - TITLE_BONUS)))` 即可 | 这是**相关性口味**而非缺陷，会直接改变根搜索的结果集；属于产品决策，需要你确认 |
| L2 | `src/lib/commands/base64/parse.ts:47,50` | `atob` 不认 base64url（`-_`），`TextDecoder` 非 fatal 把非法 UTF-8 静默变成 `�`；实测 `//5B` → `"\uFFFD\uFFFDA"` | `do-not-use.md` 明确把「url-safe / 自动判断」列为不再引入；`fatal:true` 会把乱码改成「无法解码」，是 UX 取舍，交由你定 |
| L3 | `commands/clip/ClipConfirm.svelte:29`、`commands/clip/ImagePreview.svelte:26` | 声明了 `role="dialog" + aria-modal="true"` 但焦点不进入对话框、无焦点陷阱 | 真正的修复需要「打开时移焦 + 关闭时把焦点还给搜索框」的完整管线；当前键盘流依赖焦点常驻输入框（Enter/Esc 由 SearchBar 统一处理），贸然移焦会让关闭后无法继续输入 —— 回归风险大于收益 |
| L4 | `components/SearchBar.svelte:55-380` | `onKeydown` 单函数 326 行、11 个视图分支 | 建议按视图拆成 handler 表，属中等规模重构，适合单独一次提交 + 手工回归 |
| L5 | `commands/emoji/data.ts:32-42` | `searchEmojis` 命中即 push、满 96 条即 break，结果顺序是分类顺序而非相关度；不分词 | 改变搜索排序属产品调整 |
| L6 | `commands/registry.ts:112-125`、`commands/snippet/expand.ts:19-21` | `suggest()`、`hasSnippetPlaceholder()` 无任何调用方（死代码） | 纯删除，但可能是有意保留的 API 面；未擅自删 |
| L7 | `src-tauri/src/storage/clipboard_store.rs` 的 `expire`/`expire_preview` | 标了 `#[cfg(test)]`，只在测试中编译，与 TS 侧 `clip/cleanup.ts` 是两份实现 | 删掉会丢测试覆盖，接入生产又要改前端契约；建议后续二选一收敛 |
| L8 | `src-tauri/src/commands/apps.rs:99-104` | 用 `cmd /C start "" <path>` 启动应用；虽然路径已由索引校验，但 shell 解析对特殊字符敏感 | 改用 `tauri-plugin-opener`（已是依赖）更干净，但会动到「启动应用」这一核心路径，需实机回归 |
| L9 | `clipboard.svelte.ts` 文本历史无上限 | 按 `constraints.md` 是**有意设计**（文本不设上限）；每次变化全量序列化 + IPC | 与既有决策冲突，不动 |
| L10 | `commands/clip/ClipItem.svelte:127` 等 | `ink-tertiary` 在 12px 元信息上仍不达 AA（3.25–3.47:1） | 涉及 `DESIGN.md` 的 token 定义，应由设计侧统一决策 |
| L11 | `src-tauri/src/commands/qr.rs` | 前端用 `Array.from(bytes)` 把 PNG 字节展开成 JSON 数字数组过 IPC（体积约 5–10 倍） | 需要改用 `tauri::ipc::Response` 二进制通道，属于接口改造 |
| L12 | `+page.svelte:77-81` | `$effect` 同时读写 `ui.imagePreviewSrc`，Svelte 会把它标记为依赖自身 | 写入幂等、不死循环；改成 `untrack` 更干净但收益极小 |

---

## 六、对子代理结论的复核（避免误报进入修复）

审查过程中三名子代理共提出 9 条「Critical/High」级结论，逐条验证后**驳回 6 条**，这些若不核实就会变成无意义的改动甚至回归：

| 结论 | 复核结果 |
| --- | --- |
| 「启动竞态会清空整份剪贴板历史」 | **误报**。`capture()`/`captureImage()`/`togglePin`/`remove`/`clear` 全部先 `await this.ready`，upsert 一定发生在 hydrate 之后 |
| 「`json.reset()` 全库零调用，`/json` 永远显示旧内容」 | **误报**。`JsonPanel.svelte:30` 的 `onDestroy` 会调用它 |
| 「`syncLocale` 里 `void invoke(...)` 未 await 会产生游离 rejection」 | **误报**。该调用已有 `.catch(() => {})` |
| 「`document.documentElement.lang = "zh-CN"` 不是合法 BCP-47」 | **误报**。`zh-CN` 是合法语言标签 |
| 「Theme/Language/ClipRetention 选择器的 option 不是 listbox 直接子级」 | **误报**。这三个组件的按钮即根节点；只有 EngineSelector 与 SnippetItem 需要修 |
| 「250 个中文应用 × 一次按键 = 127ms」 | **夸大**。实测短查询 1.68ms/按键；仅在粘贴数千字符的极端 query 下才成立，已针对该路径加护栏 |
| i18n 键不一致 / 缺键 / 占位符不匹配 | **两次误报**（一次因用 ANSI 读取 UTF-8 文件产生假差异）。实际 zh/en 在键集合、顺序、占位符三个维度完全一致，且无代码引用缺失键 |

保留采纳的关键项：`timestamp` 校验绕过、pinyin 覆盖率分子、emoji 加载失败永久缓存、`ScrollArea` 的 characterData、对比度计算、以及存储层原子性（后者由我独立发现并验证）。

---

## 七、验证记录

| 检查 | 结果 |
| --- | --- |
| `pnpm check`（svelte-check） | **0 errors, 0 warnings** |
| `cargo check --all-targets` | 通过，无 warning |
| `cargo test --lib` | **45 passed / 0 failed**（含新增 4 个 `json_file` 测试：覆盖写入、缺失文件、损坏隔离后仍可继续写、fallback 语义） |
| `pnpm build` | 成功（存在既有的 chunk >500kB 提示，来自按需加载的 emoji 数据与 mathjs，非本次引入） |
| i18n 一致性脚本 | zh 293 / en 293，缺失 0、多余 0、代码引用未定义键 0 |
| `rustc` 平台探测 | 确认 `fs::rename` 在 Windows 上覆盖已有目标（`MOVEFILE_REPLACE_EXISTING`） |
| Node 行为验证 | 时间戳 6 组输入、pinyin 8 组 query/name 对、fuzzy 排序 10 组 query，均以真实依赖跑通 |

失败路径的备份文件命名：`<name>.json.corrupt-<epoch>`（与数据同目录），方便用户手工恢复。

---

## 八、优点（不应在重构中丢失）

- **Svelte 5 runes 使用高度一致**：全库无 `export let`、无 `$:`、无 `on:click` 旧语法；模块级 store 单例 + `$derived` 缓存的计算结构清晰。
- **异步竞态防护到位**：`translate` 用 `seq` 序号、二维码面板用 `cancelled` 标志、`QRDecodePanel` 用 `scannedKey` 守卫，都不会用过期结果覆盖 UI。
- **清理纪律好**：`ScrollArea` 的 observer/监听、`ClipPanel` 的 10s interval、`+page.svelte` 的事件监听都在返回的清理函数里正确释放。
- **i18n 目录严格**：`en.ts` 用 `Record<MessageKey, string>` 约束，缺键会在编译期报错；这次新增 6 个 key 后仍是 293/293 完全对齐。
- **Rust 侧解析健壮**：`settings_store::normalize` 对枚举值、URL、保留天数、翻译语言都做了白名单收敛，`usage_store::is_command_usage_key` 也限制了写键的形状。
- **安全基本面良好**：无 `eval`/`new Function`/`innerHTML`，两处 `{@html}` 均有转义或可信来源，`searchUrl` 与 asset 路径都做了编码/规范化。

---

## 九、建议的后续动作

1. **打包后回归 CSP**（H6）：按报告中的配置改 `tauri.conf.json`，逐项验证图片预览、二维码解码、字体、托盘与热键，再决定是否启用。
2. **确认 `fuzzy.ts` 的弱 title 命中策略**（L1）：一行改动即可恢复被隐藏的命令提示，但会改变根搜索结果集。
3. **拆分 `SearchBar.onKeydown`**（L4）：按视图抽 handler 表，配合手工回归（方向键、Enter、Tab、Delete、Ctrl+N/E/P、中文输入法组合键）。
4. **对话框焦点管理**（L3）：若要落实 `aria-modal`，需要同时实现「打开移焦 + 关闭还原到搜索框」，建议与上面的键盘重构一起做。
5. **收敛剪贴板清理的双实现**（L7）：让 `expire` 只在 Rust 或只在 TS 一侧存在。
