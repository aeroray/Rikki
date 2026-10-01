# Do Not Use / Tombstones

Tombstones are newest first.

## Tombstone: a backup folder, a backup history, and a pre-import snapshot
Do not reintroduce unless the user explicitly reverses this. Reason: the user asked for the two things every app has — export the current configuration to a file they choose, and import that file on another machine — so the app keeps no copy of its own and no history: no `app_data_dir/backups/`, no `list_backups`, no snapshot taken before an import, no typed-path sub-screen. Export and import are two rows in the settings list, each opening the system dialog directly. Two things are explicitly *not* part of this and stay: a file missing a section is refused whole (no per-part import, which could leave two thirds of a restore applied), and the three files are committed together. Date: 2026-10-01. This reverses the "two settings rows for export/import" half of the entry it replaces, on the user's explicit request; the partial-import half is unchanged.

## Tombstone: a save dialog that leaves the palette topmost over it
Do not reintroduce unless the user explicitly reverses this. Reason: a native file dialog has no owner window, so a topmost palette covers it and its buttons cannot be clicked. `begin_native_dialog` drops topmost for the dialog's lifetime and restores it on drop; suppressing blur-hide without dropping topmost is the bug, not the fix. Date: 2026-10-01.

## Tombstone: Simple Icons (and its Svelte wrappers) as the brand-logo source
Do not reintroduce unless the user explicitly reverses this. Reason: the package has no Bing icon at all — checked at 16.33.0, and at 16.12.0, which is the snapshot the wrappers bundle — so it cannot cover the five search engines the settings offer. `@iconify-icons/cib` (CoreUI Brands, CC0, one module per icon) has all five. Date: 2026-09-30.

## Tombstone: translate settings and a source-language picker
Do not reintroduce unless the user explicitly reverses this. Reason: there is nothing left to configure — the source is guessed from the script because Sogou rejects `auto`, the target is one remembered setting (`translateTarget`) that `Tab` cycles, and a target that collides with the source falls back to the interface language. Date: 2026-09-30.

## Tombstone: clip in backups, cloud sync, and merge imports
Do not reintroduce unless the user explicitly reverses this. Reason: backups are local full overwrite of todos, snippets, and settings; clip is ephemeral, and merge or cloud sync would add conflict UI the launcher does not need. Date: 2026-08-29.

## Tombstone: estimated-height emoji/clip list windowing
Do not reintroduce unless the user explicitly reverses this. Reason: spacer-and-slice windowing desynced from real row height and snapped scroll to the selection, so scrolling a category showed an empty grid. Date: 2026-08-29.

## Tombstone: QR logos, colors, batch, ECC picker, and camera scan
Do not reintroduce unless the user explicitly reverses this. Reason: v1 is black-and-white generate plus clipboard-image decode; camera and styling add permissions and UI the launcher does not need. Date: 2026-08-29.

## Tombstone: timestamp timezones, date math, format templates, and history
Do not reintroduce unless the user explicitly reverses this. Reason: v1 shows local and UTC and copies one primary value; pickers and arithmetic add UI the launcher does not need. Date: 2026-08-29.

## Tombstone: JSON tree/diff/YAML/path/history and Base64 image/file/url-safe/auto-detect
Do not reintroduce unless the user explicitly reverses this. Reason: v1 is format/minify/validate and one-line UTF-8 Base64; extra views and guessing encode vs decode add UI the launcher does not need. Date: 2026-08-29.

## Tombstone: color picker, palettes, schemes, colorblind sim, and image sampling
Do not reintroduce unless the user explicitly reverses this. Reason: v1 is parse-and-convert plus clip recents; a screen picker needs extra permissions, and palettes or schemes add UI the launcher does not need. Date: 2026-08-29.

## Tombstone: offline translation, history, favorites, and language autocomplete
Do not reintroduce unless the user explicitly reverses this. Reason: translation is two live keyless requests with automatic word/sentence layout; extra surfaces add storage and UI the launcher does not need. Word pronunciation is not covered — the card plays Youdao's US and UK clips. Date: 2026-08-29.

## Tombstone: extra UI locales and i18n libraries
Do not reintroduce unless the user explicitly reverses this. Reason: v1 is 简体中文 and English via a small catalog; extra locales and a translation library add surface without demand. Date: 2026-08-29.

## Tombstone: Chinese in English command titles
Do not show Chinese in command titles when the UI language is English. Reason: English users cannot read Chinese or pinyin. Date: 2026-08-29.

## Tombstone: web search history, suggestions, and in-app results
Do not reintroduce unless the user explicitly reverses this. Reason: prefix search only opens the browser; history and results stay there. Date: 2026-08-29.

## Tombstone: emoji pinyin, skins, recents, and zoom
Do not reintroduce unless the user explicitly reverses this. Reason: v1 is category browse plus English keywords; default skin only; no recents, favorites, or zoom preview. Date: 2026-08-29.

## Tombstone: fallback search history
Do not reintroduce unless the user explicitly reverses this. Reason: fallback search is a shortcut; the browser keeps its own history. Date: 2026-08-28.

## Tombstone: multiple fallback engine rows
Do not reintroduce unless the user explicitly reverses this. Reason: unmatched queries run one default engine; picking Google vs Bing belongs in settings. Date: 2026-08-28.

## Tombstone: dedicated settings window
Do not reintroduce unless the user explicitly reverses this. Reason: settings stay a prefix command so they match the rest of the palette. Date: 2026-08-28.

## Tombstone: snippet one-shot add
Do not reintroduce unless the user explicitly reverses this. Reason: `sn add` opens the create form; typing title and content in the search bar was extra syntax to remember. Date: 2026-08-28.

## Tombstone: snippet auto-expand
Do not reintroduce unless the user explicitly reverses this. Reason: expanding while typing needs OS-level input monitoring and misfires; snippets copy on Enter like clip. Date: 2026-08-28.

## Tombstone: curated pinyin alias table
Do not reintroduce unless the user explicitly reverses this. Reason: Chinese app matching uses `pinyin-pro`; a hand-maintained map goes stale and misses names. Date: 2026-08-28.

## Tombstone: open prefix command
Do not reintroduce unless the user explicitly reverses this. Reason: apps launch from root search; an `open` prefix would make the common case extra typing. Date: 2026-08-28.

## Tombstone: lucide-svelte package
Do not reintroduce unless the user explicitly reverses this. Reason: the package is deprecated; use `@lucide/svelte`. Date: 2026-08-28.
