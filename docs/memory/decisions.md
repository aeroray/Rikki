# Decisions

Entries are newest first.

## 2026-08-28 - Clip is text history first
Decision:
`clip` listens with `tauri-plugin-clipboard-x`, stores text in `app_data_dir/clipboard/index.json`, and shows a color swatch when the copied string is hex/rgb/hsl. Images wait for a later phase.
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
