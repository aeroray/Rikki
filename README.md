<p align="center">
  <img src="src-tauri/icons/128x128.png" width="96" height="96" alt="Rikki">
</p>

<h1 align="center">Rikki</h1>

<p align="center">
  A Spotlight-style launcher for Windows and macOS.<br>
  <a href="README.zh-CN.md">简体中文</a>
</p>

Rikki stays in the tray and opens a glass palette on a hotkey. Type to launch installed apps, or a prefix plus space for clipboard, snippets, converters, and system actions. The name is a play on raccoon and “quick”.

## Features

- **App search** from the empty palette — icons, launch-frequency ranking, and pinyin matching (`wx` → 微信). No `open` prefix.
- **Prefix commands** for clipboard, snippets, todos, calc, anniversaries, emoji, translate, color, JSON, Base64, timestamps, and QR codes.
- **Web search** with `gg`, `bd`, `bing`, `ddg`, `sogou`, or any unmatched query of 2+ characters (default engine from settings).
- **Resident process** with a tray icon. Hide the palette; the hotkey still works.
- **简体中文 / English**, following the OS or a setting. Dark and light themes.

## Develop

Requires [pnpm](https://pnpm.io), [Rust](https://rustup.rs), and the [Tauri v2 prerequisites](https://v2.tauri.app/start/prerequisites/) for your OS.

```bash
pnpm install
pnpm tauri dev
```

Type-check the frontend with `pnpm check`.

> [!TIP]
> On Windows, if `pnpm tauri dev` exits with cargo lock errors, quit any running `rikki.exe` and try again.

## Hotkeys

| Action | Windows | macOS |
| --- | --- | --- |
| Toggle palette | `Alt+Space` | `⌘K` |
| Hide | Click outside, or the hotkey again | same |
| Rebind | `settings` → Hotkey | same |

Defaults match common launchers. Change them if they collide with another app.

## Commands

Type the prefix and a space to open the panel. Root search (no prefix) launches apps. A hex, `rgb()`, or `hsl()` value also opens the color panel.

| Prefix | Also | Enter | Notes |
| --- | --- | --- | --- |
| _(empty)_ | apps | Launch | Unmatched 2+ character queries search the web |
| `clip` | | Paste selected | `Tab` previews images; `Shift+Delete` clears unpinned history |
| `sn` | `snippet` | Copy snippet | `sn add` or `Ctrl+N` creates; `{{date}}` / `{{time}}` / `{{clipboard}}` expand on copy |
| `todo` | | Add a todo | Stays open |
| `calc` | | Copy result | History is saved |
| `ann` | `anniversary` | Edit selected, or create | Birthdays and anniversaries, solar or lunar. Type a date to count down without saving: `1001`, `20261001`, `n1001` (lunar), `nr1001` (lunar leap month) |
| `em` | `emoji` | Copy glyph | Browse categories, then search English keywords |
| `tr` | `translate` | Translate, then copy | Baidu AppID and secret in settings |
| `color` | `clr` | Copy HEX | Also from a bare `#ff6363` |
| `json` | `jsonf` | Copy, or edit if invalid | `Tab` pretty / compact |
| `b64` | `base64` | Copy | `Tab` flips to decode (`b64d`) |
| `ts` | `timestamp` | Copy primary value | Unix seconds/millis or `YYYY-MM-DD` |
| `qr` | `qrcode` | Copy SVG | `Tab` saves PNG |
| `qrd` | `qrdecode` | Copy payload | Reads a clipboard image |
| `settings` | | Open a setting | Theme, hotkey, language, translate API, clip retention, backup |
| `gg` `bd` `bing` `ddg` `sogou` | | Search in the browser | |
| `lock` `sleep` `shutdown` `reboot` `logout` | | Run immediately | |

Home-list order follows how often you open each command. Clip and snippets stay near the top until you use something else more.

## Interaction

- **Enter** completes the current command: copy, paste, launch, translate, or run.
- **Tab** is the secondary action (image preview, minify, save PNG, swap Base64 direction).
- **Esc** closes overlays and drills first, then clears the query back to the empty home. Esc on an empty home hides the palette.
- Blur or the palette hotkey hides **without** clearing, so you can come back to the last page.
- Launching, copying, or opening a web search resets the query on the next show.
- Arrow keys move the selection in lists. Convert panels use the search field only.

## Settings

Open with `settings`. Aside from theme, language, and the hotkey:

- **Search engine** — built-in engines plus custom `http(s)` URLs with `%s`.
- **Translate** — Baidu AppID, secret, and default / second target languages. Credentials save as you type.
- **Clipboard retention** — 7 days, 30 days, or never. Cleanup of expired unpinned text is a settings action, not a timer.
- **Backup** — export / import a JSON file of todos, snippets, and settings. Clip history is not included.

> [!NOTE]
> `tr` calls Baidu’s API from the app. Without AppID and secret, the translate panel cannot run a request.

## Stack

Tauri 2 (Rust) + SvelteKit 2 / Svelte 5 + Tailwind CSS 4. Data lives in the OS app-data directory (`todos.json`, `snippets.json`, `settings.json`, clipboard index and images, and so on) — not in `localStorage`.
