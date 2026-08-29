# Rikki

A Spotlight-style desktop launcher for Windows and macOS. Type to open apps, or use a prefix command for clipboard, snippets, converters, and system actions. The palette stays resident in the tray so the hotkey always works.

## Develop

```bash
pnpm install
pnpm tauri dev
```

## Hotkeys

| Action | Windows | macOS |
| --- | --- | --- |
| Toggle palette | `Alt+Space` | `⌘K` |
| Hide | `Esc`, or click outside | same |
| Change the toggle | `settings` → Hotkey | same |

These defaults match common launchers. Rebind them if they collide with another app.

Completed actions (copy, paste, launch, web search) hide the palette and clear the query. `Esc` or blur keeps the last query so you can come back.

## Commands

Type the prefix and a space to open the panel. Root search (no prefix) launches installed apps. Hex / `rgb()` / `hsl()` values also open the color panel.

| Prefix | Also | Enter | Notes |
| --- | --- | --- | --- |
| _(empty)_ | apps | Launch | Unmatched queries of 2+ characters search the web |
| `todo` | | Add a todo | Stays open |
| `calc` | | Copy result | Saves history |
| `clip` | | Paste selected | `Tab` previews images |
| `sn` | `snippet` | Copy snippet | `sn add` or `Ctrl+N` creates |
| `em` | `emoji` | Copy glyph | Browse categories, then search |
| `tr` | `translate` | Translate, then copy | Needs Baidu AppID/secret in settings |
| `color` | `clr` | Copy HEX | Also from a bare `#ff6363` |
| `json` | `jsonf` | Copy, or edit if invalid | `Tab` pretty / compact |
| `b64` | `base64` | Copy | `Tab` flips to decode (`b64d`) |
| `ts` | `timestamp` | Copy primary value | Seconds, millis, or `YYYY-MM-DD` |
| `qr` | `qrcode` | Copy SVG | `Tab` saves PNG |
| `qrd` | `qrdecode` | Copy payload | Reads a clipboard image |
| `settings` | | Open a setting | Theme, hotkey, language, translate API |
| `gg` `bd` `bing` `ddg` `sogou` | | Search in the browser | |
| `lock` `sleep` `shutdown` `reboot` `logout` | | Run immediately | |

## Interaction

- **Enter** completes the current command: copy, paste, launch, translate, or run.
- **Tab** is the secondary action (preview, minify, save PNG, swap translate direction).
- **Esc** leaves a drill-down first (preview, settings, emoji category, JSON edit), then hides the palette.
- Arrow keys move the selection in lists (apps, clip, snippets, emoji, settings). Convert panels use the search field only.
