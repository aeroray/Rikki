# Do Not Use / Tombstones

Tombstones are newest first.

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
