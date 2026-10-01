# Rikki brand assets

The approved logo is the rounded, front-facing lavender raccoon (refined concept A). Keep its simple solid eyes, compact cheeks and small nose; it has no mouth.

- `mark.png` is the approved transparent mark, without a background.
- `../../src-tauri/icons/tray.png` is the tray icon: `mark.png` cropped to its content and scaled to 32px, so the raccoon reaches all four edges. It is **not** the app icon on purpose — that one is the raccoon on a near-black tile, and a black tile on a dark taskbar is invisible, which left the tray showing a small floating face beside icons that filled their box. Made by hand, because cropping needs an image library Node does not have; `scripts/generate-icons.mjs` says so too.
- `icon-source.png` is the default application icon master: the same raccoon on a rounded near-black tile (`#07080a`), with transparent outer corners. Use this backed version in both light and dark themes. **The tile must reach all four edges of the canvas** — `tauri icon` passes whatever margin the master has into every size, so a master drawn with breathing room produces icons that look small everywhere they are drawn.
- `../../static/logo.png` is the exported 512px logo used by both READMEs and available to frontend brand surfaces.
- `../../static/favicon.png` is the 64px browser icon.
- `../../src-tauri/icons/` contains the generated Windows ICO, macOS ICNS, PNGs and Windows tile assets. The tray uses `tray.png`, not the app icon.

Run `pnpm icons` from the project root after changing `icon-source.png`. This uses the installed Tauri CLI and exports only desktop assets into the repository. Do not edit the size variants individually or use other exploration concepts as production assets.

The palette currently has no separate brand banner. Its search-engine and command glyphs describe their functions and remain those glyphs.
