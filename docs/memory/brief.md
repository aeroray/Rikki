# Project Brief

Purpose:
- Rikki is a Windows and macOS Spotlight-style desktop launcher. A hotkey opens a small glass search palette; command prefixes trigger features. The mascot is a raccoon (Rikki ≈ raccoon, sounds like "quick").

Current direction:
- `clip` keeps text and image clipboard history, with source app, exact-content dedupe, and overlay image preview. Calc and todo are on `main`. A tray icon stays while the palette is hidden. In-app spec is `design/DESIGN.md`; root `DESIGN.md` remains the Linear token reference.

System shape:
- Tauri v2 (Rust) + SvelteKit 2 / Svelte 5 + Tailwind CSS 4, packaged with pnpm. Todos persist in `todos.json`, calc history in `calc-history.json`, clipboard history in `clipboard/index.json` plus `clipboard/images/`.
