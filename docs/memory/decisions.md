# Decisions

Entries are newest first.

## 2026-09-30 - Browsers show their own icon; search engines show their brand
Decision:
The browser picker renders each browser's real icon — extracted by `apps_icons` into `app_data_dir/apps/icons/browsers/`, named by the hash of the executable path, extracted once and then cached — and falls back to the existing `Compass` tile when there is none. The search field's leading icon becomes the engine's mark for `gg`/`bd`/`bing`/`ddg`/`sogou` and for the fallback-search row, and stays the magnifier everywhere else, custom engines included. The marks come from `@iconify-icons/cib` (CoreUI Brands, CC0), one module per icon, drawn monochrome through `currentColor` in `components/EngineMark.svelte`.
Reason:
A browser's own icon is the only source that can label a browser no library has heard of (`Tabbit浏览器`), and it is the extraction installed apps already use — a logo library could only guess or give up. For the engines, Simple Icons — the obvious source, and what its Svelte wrappers are built from — has no Bing at all, so it cannot cover the five engines the settings offer; CoreUI Brands is the only set found with all five, and its per-icon modules mean five marks cost ~4KB rather than the whole 830-icon set.
Note:
`write_png` had been failing every extraction since the atomic-write change: it wrote through `dest.with_extension("png.tmp")` and let `image::save` read the format off that extension, so no app icon had been extracted since 2026-09-30. It now names `ImageFormat::Png`, guarded by a Windows test that writes one and reads it back. On macOS a browser's executable path is resolved up to its `.app` bundle before the `.icns` is looked for; that path is unverified.

## 2026-09-30 - Translate is keyless: Sogou for sentences, Youdao for words
Decision:
`tr` posts sentences to Sogou's Hunyuan endpoint (`text`/`from_lang`/`to_lang`, no key and no signature) and single words to Youdao's public dictionary, which returns US and UK phonetics with matching audio, part-of-speech definitions, word forms and bilingual examples. The dictionary sits behind `lookup_word`, so a word it does not know falls through to the translator. One setting, `translateTarget`, holds the target and `Tab` cycles it; the source is guessed from the script, and a target that would equal the source falls back to the interface language.
Reason:
Baidu required the user to register an app and paste an AppID and a secret before the command did anything at all, and its results were poor — a launcher should not open with a configuration task. Sogou's Hunyuan endpoint is the one its own translate page calls for free text and it returns a model translation rather than a phrase-table lookup, while Youdao's dictionary is public and returns exactly what a word card needs. Sogou rejects `auto` as the source, so guessing is the only way to send a request at all, and one remembered target means the common zh↔en case needs no trip to a settings screen.
Note:
The dictionary is Youdao's rather than Sogou's because Sogou's is signed rather than public. Pronunciation audio is fetched in Rust and returned base64 to play from a `data:` URL, so the webview still has no network access of its own and the CSP only gained `media-src 'self' data:`. The translate settings screen was deleted: there is nothing left to configure.

## 2026-09-30 - Commands answer to Chinese and pinyin, not just a Latin prefix
Decision:
`rankCommand` scores `pinyin-pro` against every Chinese name a command has, and the whole vocabulary (Chinese names, a few Latin additions) lives in one table, `src/lib/commands/aliases.ts`, merged in `register()`. `match()` and `fuzzyScore` normalise full-width forms and the ideographic space to ASCII first. A vitest suite guards the table: every command has an entry, no entry outlives its command, no two commands claim the same spelling, and every spelling resolves through `match()`.
Reason:
The prefix syntax assumes a keyboard with no IME in the way. With one active, the search box holds the *pinyin* while it composes — so a command that only answers to `cal` stays invisible until the characters are committed, which is a keystroke the user should not have to spend. Scoring pinyin means `wnl`, `rili` and `chongqi` all find their command before anything is committed, and `pinyin-pro` handles 多音字 (`chongqi` and `zhongqi` both reach 重启) better than any hand-written table would. The ideographic space is not cosmetic: an IME's space bar emits U+3000 and the syntax is `prefix + " "`, so `ann　1001` previously matched nothing at all.
Note:
`rili` has to reach the calendar even though its title is 万年历, which is why the Chinese aliases are load-bearing rather than a convenience — pinyin is derived from them, so an alternative name for the same thing needs its own entry. Measured cost of the pinyin pass: ~0.09ms for 34 names, so ~0.2ms per keystroke across every command.

## 2026-09-30 - Commands that cannot be undone ask first
Decision:
A `Command` may carry `confirm: true`. `activateCommand` then arms `ui.requestConfirm` instead of running it, and `ActionConfirm` carries it out on a second Enter (Esc or the backdrop cancels). `shutdown`, `reboot` and `logout` are marked; `lock` and `sleep` are not, since both are one keystroke to reverse. Deleting a custom search engine uses the same dialog with its own body text.
Reason:
A launcher is driven fast and from muscle memory, and the prefix alone is not much of a guard — the mistake costs whatever was open. This is the second layer: the first is that an action command only fires when its prefix was actually typed, because `reb` fuzzy-matches `reboot` as the only hit.
Note:
The key hint lives inside each button rather than in a row beside it: the same two words twice was redundant, and in English the two groups together were wider than the 320px card.

## 2026-09-30 - The window keeps a CSP, with `'unsafe-inline'` for scripts
Decision:
`app.security.csp` is set rather than `null`: `default-src 'self'`, `script-src 'self' 'unsafe-inline'`, `img-src 'self' asset: http://asset.localhost data: blob:`, `connect-src 'self' ipc: http://ipc.localhost`, and `object-src`/`base-uri`/`frame-ancestors`/`form-action` locked down.
Reason:
Both `{@html}` sites (the JSON highlighter, the QR SVG) were verified safe, so this is depth rather than a fix. `connect-src` is the part that does real work: it stops an injected script from shipping clipboard contents off the machine. The `'unsafe-inline'` is measured, not assumed — SvelteKit inlines its bootstrap script, Tauri only nonces `script[src^='http']`, and a build served with `script-src 'self'` renders a blank page. A nonce for that script would need a SvelteKit HTML transform plus a Tauri token, and would break `pnpm tauri dev`, where the HTML does not pass through Tauri's asset handler.
Note:
To re-check: build, inject the policy as a `<meta http-equiv>` tag, and load it — with `'unsafe-inline'` the app renders, without it the page is blank.

## 2026-09-30 - Two Windows APIs that are per-thread, not per-process
Decision:
Cursor repair and global-shortcut re-registration both run on the main thread, and the shortcut restore is deferred through a *different* thread before it gets there.
Reason:
`ShowCursor`'s display counter is per-thread: measured with the main thread at -2, a freshly spawned thread reads 0. A repair on a worker thread therefore reads its own untouched count and returns without calling `ShowCursor` at all — which is exactly what an earlier attempt at this fix did. Separately, `run_on_main_thread` runs its closure *inline* when the caller is already on the main thread, so it cannot be used to escape a callback that is itself on the main thread.
Note:
The shortcut plugin holds its own mutex for the whole duration of the callback it invokes, and `register`/`unregister` take that same mutex. `std::sync::Mutex` is not reentrant, so calling either from inside the handler deadlocks the app — hence the thread hop, not a `run_on_main_thread` call.

## 2026-09-30 - Panels end in a pinned footer, not a hint paragraph
Decision:
Every panel ends with `components/PanelFooter.svelte`: a chrome bar where each shortcut is a `kbd` chip beside its action, a hairline separates it from the content, and it is a flex sibling of the content column rather than its last child. The calendar adopted it first and the other fourteen panels followed in the same change; `.palette-hint` is gone from `app.css` and no panel uses it. Actions shared by several panels live in one `key.*` vocabulary (`key.back`, `key.copy`, `key.save`, `key.cancel`, `key.confirm`, `key.open`, `key.edit`, `key.add`, `key.delete`) instead of being reworded per panel, which is what keeps "返回" reading the same everywhere.
Reason:
The calendar's hint was the last child of the content column, so a 6-week month pushed it out of the 600×400 palette and made the panel jump between months. Six rows is the true maximum — 516 of the 2412 months from 1900 to 2100, never seven — so the day grid takes `grid-rows-6` with `min-h-0 flex-1`, and the cells fill their row instead of a fixed `h-8`. That keeps the grid height constant whatever the month contains and leaves the footer always visible. Key chips are untranslated glyphs; the old combined hint strings (`calendar.footer`, `json.copyHint`, `clip.footer`, …) were deleted as they were replaced, since the catalogs must not carry unused keys.
Note:
`PanelFooter` takes `shortcuts`, `message`, or both: `message` alone centres a note, and beside shortcuts it right-aligns. A panel computes both with `$derived.by` so one component covers hint, error and confirmation states. Sub-screens with their own chrome (`AnniversaryCreate`, `SnippetCreate`, `EngineCreate`) keep their own bottom rows and deliberately do not render the parent's footer.

## 2026-09-24 - The calendar stays on `lunar` v2 and ships no almanac data
Decision:
`cal` (aliases `calendar`, `date`, 日历, 万年历) opens a month grid with lunar day names, ganzhi and zodiac in the header, today ringed, weekends dimmed, and a one-line detail strip for the selected day. Arrows walk days, PgUp/PgDn change month, Shift+↑↓ change year, Home returns to today, Enter copies the date, and `cal 20261001` jumps. It reads the same `lunar` v2 tables as the anniversary command, loaded on demand.
Reason:
6tail's `lunar-typescript` is the only candidate that offers a real almanac (solar terms, 宜忌, 冲煞, 纳音, 星宿, 八字, 值神, 建除, 吉神凶煞, 时辰, holidays) — measured at 28 available fields against `lunar` v2's zero. It was still declined: it cannot be tree-shaken (importing only `Solar` ships 325KB minified / 100KB gzipped, against 8.9KB for the lazy `lunar` chunk), and the launcher's calendar does not need a 黄历. The user chose the light option knowingly. `lunar` v2 gained `yearGanZhi`, `yearZodiac`, `lunarYearDays` and `lunarMonthDays`, all derived from data it does expose and verified against known values (2026 丙午/马, 2025 乙巳/蛇, 1984 甲子/鼠; leap years 384 days vs 354 common).
Note:
If a future command genuinely needs solar terms or 宜忌, switching to 6tail is a contained change: everything lunar goes through `anniversary/lunar.ts`, so only that adapter and its import would move.

## 2026-09-24 - Lunar calendar uses `lunar` v2, not 6tail's lunar-typescript
Decision:
Lunar conversion goes through `src/lib/commands/anniversary/lunar.ts`, which wraps the `lunar` v2 package (MIT, full TS types, range 1890-2100) behind a small `LunarApi` surface. The library is imported on demand. Leap months are entered explicitly (`nr1001` = lunar leap Oct 1) rather than inferred; `leapMonthOf()` derives a year's leap month by probing, memoised.
Reason:
Measured, not assumed. `lunar-typescript` / `lunar-javascript` (6tail) are monolithic and cannot be tree-shaken: importing only `Solar` still shipped 325KB minified (~100KB gzipped). `lunar` v2 ships 12KB minified (~4KB gzipped), and the lazy chunk in the real build is 8.9KB. Both were verified equally accurate — every Spring Festival, Mid-Autumn and Dragon Boat date matched, and a full-range comparison of derived leap months against 6tail's official `getLeapMonth()` agreed on all 211 years (1890-2100) with 605 sampled conversions identical. `lunar` v2 was chosen over `solarlunar` too: wider range, richer data (ganzhi, zodiac, festivals) for future calendar commands, and explicit throws instead of `-1` sentinels.
Note:
v2 has no "which month is leap in year Y" query; the probe is the documented workaround and costs ~0.03ms. A leap flag cannot be derived from the year alone in general — a year repeating month 5 leaves "month 5" ambiguous — which is why the input carries it.

## 2026-09-24 - Anniversary dates are typed compactly in one field
Decision:
Dates are entered without separators: `1001` is Oct 1, `20261001` adds a start year, `n1001` marks lunar, `nr1001` marks a lunar leap month. The create form has exactly two inputs (name, date) — no month/day spinners, no calendar toggle, no leap checkbox, no separate start-year field. The date field echoes back what it resolved to.
Reason:
Fewer, larger inputs with immediate feedback beat a form of small widgets. The year inside the date IS the start year, so a second year input was redundant; and a leap-month checkbox is wrong because whether a month repeats is a property of the year, not a choice the user makes.

## 2026-09-24 - Storage writes go through one atomic JSON helper
Decision:
Every persisted file uses `src-tauri/src/storage/json_file.rs`: write a temp file, then `fs::rename` over the target with no `remove_file` first (`fs::rename` already replaces an existing destination on Windows and Unix). A file that fails to parse is renamed to `<name>.corrupt-<epoch>` and rebuilt — settings and usage fall back to defaults, the app cache to a fresh scan, the clip index to an empty list. `usage_count` increments take a process-wide mutex.
Reason:
Remove-then-rename left a window where the user's file did not exist at all. One unreadable byte in `settings.json` made every later `update_setting` fail, so settings could never be changed again, and `usage_count.json` used `unwrap_or_default()`, silently zeroing every launch count.

## 2026-08-30 - Palette chrome uses Raycast-like tokens
Decision:
Dark canvas is `#07080a`, panels `#111214`, hairlines `rgb(255 255 255 / 0.06)`. Rows select and hover with translucent fills, not a 2px accent border. Home-list fade-stagger runs only when the empty palette opens.
Reason:
Solid black, off-grid padding, and a hard selected outline read as cheap next to a command palette.

## 2026-08-30 - Home list ranks by command usage
Decision:
Empty-home commands sort by `usage_count.json` key `command:{id}` descending, then a default rank with clip and snippet first. Count once per visit when a prefix panel or web prefix + space becomes active; restoring the last query does not count. The empty home is only the command list; it has no instructional copy.
Reason:
Map insertion order looked alphabetical, and a fresh install should still surface the commands people open most.

## 2026-08-29 - Escape steps back to home before hiding
Decision:
Escape closes overlays and drills first, then clears the search and returns to the empty home. Escape on an empty home hides the palette. Blur and the palette hotkey still hide without clearing.
Reason:
Users need to leave color, clip, and other panels to open a different command without dismissing the launcher.

## 2026-08-29 - Palette restores last query after a casual hide
Decision:
Blur or hotkey hide keeps the last query and page. Launching, copying, or opening a web search resets on the next show. Escape from a panel clears the query instead of hiding with it.
Reason:
Leaving to copy a setting must not dump the user back to an empty palette.

## 2026-08-29 - Clip cleanup lives in settings
Decision:
Retention stays 7 / 30 / never. Cleaning expired unpinned text and extra images is a settings action with a confirm. Clearing unpinned clip history is Shift+Delete in the clip panel, also with a confirm.
Reason:
The clip panel is for browsing and pasting; bulk delete belongs with retention or a shortcut, not two footer buttons.

## 2026-08-29 - Backups overwrite todos, snippets, and settings
Decision:
Settings can export and import a versioned JSON backup of todos, snippets, and settings. Import replaces those files in full. Clip history is not included.
Reason:
Those three are user-owned; clip is ephemeral, and merge or cloud sync would add UI the launcher does not need.

## 2026-08-29 - Clip texts stay; images cap at 200 and 5MB
Decision:
Clipboard text has no count cap. Images keep at most 200 files; a copy over 5MB is skipped and not stored. Oldest images (unpinned first) are dropped with their files.
Reason:
Text is small enough to keep; image files are the storage risk, and 5MB covers screenshots and normal photos.

## 2026-08-29 - No list virtualization; lazy-load heavy packs
Decision:
Do not window emoji or clip lists. Emoji search still caps at 96. `@emoji-mart/data` and mathjs load on first use; command panels stay static imports.
Reason:
Estimated-height windowing left empty space when scrolling; a 400px palette already scrolled smoothly with the full DOM.

## 2026-08-29 - Copy uses the clipboard plugin and flashes on failure
Decision:
Text copies go through `tauri-plugin-clipboard-x` with capture suppressed. Failures flash in the palette instead of hiding.
Reason:
Navigator clipboard was silent on failure and polluted clip history with converter output.

## 2026-08-29 - QR generate copies SVG; decode reads clip images
Decision:
`qr`/`qrcode` builds an SVG in the search bar (Enter copies SVG, Tab saves PNG). `qrd`/`qrdecode` runs jsQR on clipboard images. Black/white, error level H. No camera, logo, or color options.
Reason:
Screenshots already land in clip history, so decode does not need a camera; a save dialog must ignore blur-hide so the palette stays up.

## 2026-08-29 - Timestamp converts in the search bar
Decision:
`ts`/`timestamp` parses 10-digit seconds, 13-digit millis, `YYYY-MM-DD` (also `/` and optional time), and 今天/today/now. Unix input copies local time; date input copies seconds. Local and UTC only; no history.
Reason:
Developers convert timestamps constantly; the search field is enough, and extra timezone or date-math UI is out of scope.

## 2026-08-29 - JSON and Base64 are prefix convert panels
Decision:
`json`/`jsonf` formats clipboard or rest, Tab minifies, Enter copies when valid else edits, Esc leaves edit. `b64`/`base64` encode and `b64d`/`base64d` decode in the search bar; Tab flips direction. Frontend only; no history.
Reason:
JSON needs a panel for multiline editing; Base64 is one-line in/out like calc.

## 2026-08-29 - Root search detects color values
Decision:
Typing `#ff6363`, `rgb()`, or `hsl()` (including alpha) opens the color panel with no prefix. `color` / `clr` is the same panel. Names come from `color-name`; recents are the last 10 unique clip colors. Enter copies HEX.
Reason:
Raycast shows a color preview from a bare hex; a prefix would hide the common case.

## 2026-08-29 - UI language follows the system
Decision:
Settings persist `locale` as `system` | `zh-CN` | `en` (default system). Any OS `zh*` locale becomes Simplified Chinese; everything else is English. zh-CN command titles stay `中文 · English`; English UI shows the English title only.
Reason:
English users cannot use Chinese labels or pinyin; following the OS avoids a first-launch language prompt.

## 2026-08-29 - Web search prefixes open the browser
Decision:
`gg`, `bd`, `bing`, `ddg`, and `sogou` search that engine in the default browser and hide. Unmatched queries still use the one default engine from settings. There is no search history, suggestions, or in-app results.
Reason:
Picking an engine is a prefix, not extra fallback rows; the browser already does search well.

## 2026-08-29 - Emoji is browse-first copy
Decision:
`em` / `emoji` browses `@emoji-mart/data` categories, with English keyword search as a helper. Copy writes the native glyph, shows a notice, then hides after 1.2s. Search uses the palette field, not a second box.
Reason:
The dataset already classifies Unicode emoji; Chinese users can browse, and a second search field would fight the launcher chrome.

## 2026-08-28 - Settings live in the palette; unmatched queries search the web
Decision:
`settings` persists `app_data_dir/settings.json`. Theme is dark or light (DESIGN inverse tokens, lavender accent). The palette hotkey rebinds through global-shortcut. Custom engines are http(s) URLs with `%s`. Unmatched queries of 2+ characters open the default engine.
Reason:
A launcher should finish a query on Enter, and settings should stay a prefix panel rather than a nested folder or a separate window.

## 2026-08-28 - User-facing text uses the UI sans font
Decision:
Lists, kbd chips, and other user-facing copy inherit `--font-sans`. Do not use Tailwind `font-mono` for clip bodies or labels that may contain CJK.
Reason:
`font-mono` has no CJK faces, so Chinese Windows falls back to SimSun.

## 2026-08-28 - Sensitive snippets are masked, not encrypted
Decision:
Snippets can be marked `sensitive`. The list shows `******` instead of the body; Enter still copies. Edit shows the full text. This is peek protection, not encryption.
Reason:
API keys and passwords should not sit in plaintext in a Glanceable list, but a launcher should not add a password vault.

## 2026-08-28 - Snippets are search-to-copy
Decision:
`sn` / `snippet` lists snippets and copies on Enter. Copying writes the system clipboard but adds no clip history row, because a stored template is not a new copy and recording it cluttered clip. `sn add` or Ctrl+N opens the create form, rows can edit/delete, and copy expands `{{date}}`, `{{time}}`, and `{{clipboard}}`. There is no auto-expand while typing, and no one-shot `sn add 标题 内容`.
Reason:
System-wide expansion needs input monitoring and misfires; clip-style search-and-copy matches the launcher.

## 2026-08-28 - System power commands
Decision:
`lock`, `sleep`, `shutdown`, `reboot`, and `logout` are action commands: Enter runs them and hides the palette. Power actions use `tauri-plugin-power-manager`; lock is a custom Rust command. They do not open a prefix panel.
Reason:
The plugin already covers the four power APIs, and a panel would add a step the launcher does not use.

## 2026-08-28 - App ranking uses icons, usage, and pinyin
Decision:
Root-search apps show extracted icons, rank by fuzzy match then launch count (`usage_count.json`), and match Chinese names with `pinyin-pro` (`wx` → 微信).
Reason:
The library has a full pinyin dictionary, so a hand-maintained alias table is unnecessary.

## 2026-08-28 - Apps launch from root search
Decision:
Installed apps appear in the palette root search. Typing matches names with existing fuzzy scoring; Enter launches. There is no `open` prefix command.
Reason:
Opening an app should be the default launcher action, without a prefix to remember.

## 2026-08-28 - Clip images preview in an overlay
Decision:
Image rows stay compact (40px thumbs). Full-size preview is a frontend overlay (Tab or thumbnail zoom), not an inline large image or a second Tauri window.
Reason:
Large in-list images break scan density; a palette-sized mask is enough and needs no Rust.

## 2026-08-28 - Clip records source app and dedupes
Decision:
A clip row stores the foreground app at copy time. Copying the same text or image again removes the old row and places one updated row at the top.
Reason:
Users need to see where a clip came from, and identical copies should be a single history item.

## 2026-08-28 - Clip paste keeps list order
Decision:
Pasting a clip item writes it to the clipboard and sends Ctrl/⌘+V after the palette hides. The history row stays where it is; `createdAt` is not bumped.
Reason:
Reordering on paste made it look like a new copy, and Enter with an empty `clip ` rest never reached paste.

## 2026-08-28 - Tray is the quit surface
Decision:
A tray icon stays while the palette is hidden. Left-click opens the palette; the menu has Open and Quit.
Reason:
`skipTaskbar` leaves no taskbar button, so the tray is the way to reopen or exit the resident process.

## 2026-08-28 - Clip images are files, text still wins
Decision:
Clipboard bitmaps save under `app_data_dir/clipboard/images/` and preview with `convertFileSrc`. A copy with real non-URL text is stored as text, not the accompanying bitmap. Image caps are in the 2026-08-29 200/5MB decision.
Reason:
Windows often attaches a DIB to formatted text; preferring text keeps ordinary copies from becoming image rows.

## 2026-08-28 - Clip is text history first
Decision:
`clip` listens with `tauri-plugin-clipboard-x`, stores text in `app_data_dir/clipboard/index.json`, and shows a color swatch when the copied string is hex/rgb/hsl.
Reason:
The plugin already watches the system clipboard while the launcher stays resident; color preview is a frontend regex plus a swatch.

## 2026-08-28 - Calc evaluates in the frontend
Decision:
The `calc` command evaluates expressions with mathjs in the frontend and copies the result on Enter. History is stored in `app_data_dir/calc-history.json` through Rust.
Reason:
Evaluation is a local string-in path; history has to survive quit, using the same app-data JSON pattern as todos.

## 2026-08-28 - Overlay ScrollArea
Decision:
Lists use `$lib/components/ScrollArea.svelte`: native overflow stays, the thumb is an overlay. Selected command rows use an inset 2px border, not outline.
Reason:
`overflow-y: auto` clips outside outlines, and the Windows native scrollbar does not match the glass palette.

## 2026-08-28 - Interruptible palette motion
Decision:
Palette show/hide uses CSS transitions (150ms in, 100ms out). Search glow pulses at 1.2s. Todo rows fly in/out; the todo field slides.
Reason:
Keyframes cannot reverse mid-toggle, and a 300ms glow loop would strobe on a always-on-top launcher.

## 2026-08-28 - Persist todos as JSON
Decision:
Store todos in `app_data_dir/todos.json` through Rust `get_todos` and `save_todos`. The frontend hydrates on boot and writes after each mutation.
Reason:
The launcher must keep todos after quit, using the OS app-data directory on both Windows and macOS.

## 2026-08-28 - Prefix command registry
Decision:
Commands register by prefix. `match` accepts the prefix or `prefix + space`; `suggest` fuzzy-matches incomplete input.
Reason:
This matches launcher typing without loading every command's UI up front.

## 2026-08-28 - Official SvelteKit template
Decision:
Use create-tauri-app's current `svelte-ts` template (SvelteKit + adapter-static SPA) instead of a separate Vite + `App.svelte` tree.
Reason:
That is what `pnpm create tauri-app --template svelte-ts` generates now, and it is the supported Tauri frontend path.

## 2026-08-28 - Platform hotkeys
Decision:
Toggle with Alt+Space on Windows and Command+K on macOS. Esc or losing focus hides the window after a short grace period.
Reason:
These match common launcher conventions, and blur-hide needs a grace period so `show()` does not immediately dismiss.

## 2026-08-28 - Frameless overlay launcher
Decision:
The palette is a 600×400 centered, always-on-top, skip-taskbar, transparent frameless window that starts hidden.
Reason:
A Spotlight-style launcher must overlay other apps without taskbar chrome or traffic lights.
