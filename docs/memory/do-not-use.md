# Do Not Use / Tombstones

Tombstones are newest first.

## Tombstone: QR logos, colors, batch, ECC picker, and camera scan
Do not reintroduce unless the user explicitly reverses this. Reason: v1 is black-and-white generate plus clipboard-image decode; camera and styling add permissions and UI the launcher does not need. Date: 2026-08-29.

## Tombstone: timestamp timezones, date math, format templates, and history
Do not reintroduce unless the user explicitly reverses this. Reason: v1 shows local and UTC and copies one primary value; pickers and arithmetic add UI the launcher does not need. Date: 2026-08-29.

## Tombstone: JSON tree/diff/YAML/path/history and Base64 image/file/url-safe/auto-detect
Do not reintroduce unless the user explicitly reverses this. Reason: v1 is format/minify/validate and one-line UTF-8 Base64; extra views and guessing encode vs decode add UI the launcher does not need. Date: 2026-08-29.

## Tombstone: color picker, palettes, schemes, colorblind sim, and image sampling
Do not reintroduce unless the user explicitly reverses this. Reason: v1 is parse-and-convert plus clip recents; a screen picker needs extra permissions, and palettes or schemes add UI the launcher does not need. Date: 2026-08-29.

## Tombstone: auto-flip zh/en from the UI locale
Do not retarget bare `tr` from the current UI language, or hardcode Chinese↔English as the fallback pair. Reason: default and second targets are persisted settings, seeded once from the UI locale. Date: 2026-08-29.

## Tombstone: offline translation, TTS, history, favorites, and language autocomplete
Do not reintroduce unless the user explicitly reverses this. Reason: v1 is one live Baidu request with automatic word/sentence layout; extra surfaces add storage and UI the launcher does not need. Date: 2026-08-29.

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
