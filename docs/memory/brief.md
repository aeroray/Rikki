# Project Brief

Purpose:
- Rikki is a Windows and macOS Spotlight-style desktop launcher. A hotkey opens a small glass search palette; command prefixes trigger features. The mascot is a raccoon (Rikki ≈ raccoon, sounds like "quick").

Current direction:
- `main` has the palette and todo. `calc` evaluates mathjs expressions in the frontend; history is stored in `app_data_dir/calc-history.json`. In-app spec is `design/DESIGN.md`; root `DESIGN.md` remains the Linear token reference.

System shape:
- Tauri v2 (Rust) + SvelteKit 2 / Svelte 5 + Tailwind CSS 4, packaged with pnpm. Todos persist in `app_data_dir/todos.json`; calc history in `calc-history.json`.
