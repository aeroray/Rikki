# Project Brief

Purpose:
- Rikki is a Windows and macOS Spotlight-style desktop launcher. A hotkey opens a small glass search palette; command prefixes trigger features. The mascot is a raccoon (Rikki ≈ raccoon, sounds like "quick").

Current direction:
- Phases 1–4 of the v1 spec are in place (palette, todo command, JSON persistence, motion). In-app spec is `design/DESIGN.md`; root `DESIGN.md` remains the Linear token reference.

System shape:
- Tauri v2 (Rust) + SvelteKit 2 / Svelte 5 + Tailwind CSS 4, packaged with pnpm. Todos will persist in `app_data_dir/todos.json`.
