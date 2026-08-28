# Decisions

Entries are newest first.

## 2026-08-29 - Emoji is browse-first copy
Decision:
`em` / `emoji` browses `@emoji-mart/data` categories, with English keyword search as a helper. Copy writes the native glyph, shows a notice, then hides after 1.2s. Search uses the palette field, not a second box.
Reason:
The dataset already classifies Unicode emoji; Chinese users can browse, and a second search field would fight the launcher chrome.

## 2026-08-29 - Command titles are Chinese then English
Decision:
Command titles show Chinese, a middle dot, then the English name (`待办 · Todo`). The empty palette is only the command list; it has no instructional copy.
Reason:
Hints overlapped the list, and Chinese users need to see the English prefix without a language setting.

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
Decision:
Copying a snippet writes the system clipboard but does not add a clip history row.
Reason:
The text is a stored template, not a new copy, and recording it cluttered clip.

## 2026-08-28 - Snippets are search-to-copy
Decision:
`sn` / `snippet` lists snippets and copies on Enter. `sn add` or Ctrl+N opens the create form, rows can edit/delete, and copy expands `{{date}}`, `{{time}}`, and `{{clipboard}}`. There is no auto-expand while typing, and no one-shot `sn add 标题 内容`.
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
Clipboard bitmaps save under `app_data_dir/clipboard/images/` (50MB cap) and preview with `convertFileSrc`. A copy with real non-URL text is stored as text, not the accompanying bitmap.
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
