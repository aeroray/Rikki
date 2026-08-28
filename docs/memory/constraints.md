# Constraints

- Keep existing MemoryCustodian and design files (`AGENTS.md`, `CLAUDE.md`, `GEMINI.md`, `DESIGN.md`, `docs/memory/`). Do not delete them during scaffolding.
- v1 targets Windows and macOS desktop only.
- Use pnpm as the package manager.
- The launcher process stays resident while the window is hidden so the global hotkey keeps working.
- Visual tokens follow root `DESIGN.md` (Linear-inspired dark canvas, lavender `#5e6ad2` as the only accent).
- Persist todos only in `app_data_dir/todos.json` via Rust commands. Do not use `localStorage` or other frontend stores.
