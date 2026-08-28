# Project Brief

Purpose:
- Rikki is a Windows and macOS Spotlight-style desktop launcher. A hotkey opens a small glass search palette; command prefixes trigger features. The mascot is a raccoon (Rikki ≈ raccoon, sounds like "quick").

Current direction:
- Root search launches installed apps (no `open` prefix), with icons, launch-frequency ranking, and `pinyin-pro` matching. `clip`, calc, todo, and `sn`/`snippet` stay prefix commands (`sn add` or Ctrl+N opens the create form; copy expands `{{date}}`/`{{time}}`/`{{clipboard}}`). `lock`, `sleep`, `shutdown`, `reboot`, and `logout` run immediately. A tray icon stays while the palette is hidden. In-app spec is `design/DESIGN.md`; root `DESIGN.md` remains the Linear token reference.

System shape:
- Tauri v2 (Rust) + SvelteKit 2 / Svelte 5 + Tailwind CSS 4, packaged with pnpm. Todos persist in `todos.json`, calc history in `calc-history.json`, clipboard history in `clipboard/index.json` plus `clipboard/images/`, snippets in `snippets.json`.
