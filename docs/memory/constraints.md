# Constraints

- Keep existing MemoryCustodian and design files (`AGENTS.md`, `CLAUDE.md`, `GEMINI.md`, `DESIGN.md`, `docs/memory/`). Do not delete them during scaffolding.
- v1 targets Windows and macOS desktop only.
- Use pnpm as the package manager.
- The launcher process stays resident while the window is hidden so the global hotkey keeps working. A tray icon is the visible handle to reopen or quit.
- Visual tokens follow root `DESIGN.md` (Linear-inspired dark canvas, lavender `#5e6ad2` as the only accent).
- Persist todos in `app_data_dir/todos.json`, calc history in `calc-history.json`, clipboard history in `clipboard/index.json`, snippets in `snippets.json`, settings in `settings.json`, installed-app cache in `apps.json`, launch counts and command visits in `usage_count.json` (app paths and `command:{id}` keys), and extracted app icons in `apps/icons/`. Clipboard images live in `clipboard/images/`: text history is uncapped, images cap at 200 files, and a single image over 5MB is skipped. Text retention is 7 or 30 days or never (`clipTextRetentionDays`); expired unpinned text is removed only by the settings cleanup action. Do not use `localStorage` or other frontend stores.
