<p align="center">
  <img src="static/logo.png" width="96" height="96" alt="Rikki raccoon logo">
</p>

<h1 align="center">Rikki</h1>

<p align="center">
  A Spotlight-style launcher for Windows and macOS.<br>
  <a href="README.zh-CN.md">简体中文</a>
</p>

Rikki sits in the tray and opens a glass palette on a hotkey. Type to launch an app, or a prefix and a space for everything else. The name is a play on raccoon and "quick".

## What it does

- **Launch apps** — type any part of the name. Icons, pinyin (`wx` → 微信), ranked by how often you open it.
- **Clipboard history** — text, images and copied files. Pin what you want to keep; `Tab` previews an image.
- **Snippets** — save text once, copy it with `sn`. `{{date}}`, `{{time}}` and `{{clipboard}}` expand on copy.
- **Converters** — calc, color, JSON, Base64, timestamps, QR codes (make one, or read one from the clipboard).
- **Translate** — no API key. A word gets a dictionary card; a sentence gets two translations.
- **System** — lock, sleep, shutdown, reboot, logout; web search with `gg`, `bd`, `bing`, `ddg`, `sogou`.
- **中文 / English**, dark, light or following the system, and the hotkey is yours to rebind.

## Run it

Needs [pnpm](https://pnpm.io), [Rust](https://rustup.rs), and the [Tauri v2 prerequisites](https://v2.tauri.app/start/prerequisites/) for your OS.

```bash
pnpm install
pnpm tauri dev      # run
pnpm tauri build    # package
```

`pnpm check` type-checks the frontend, `pnpm test` runs the unit tests.

`pnpm icons` regenerates the desktop icons, favicon and README logo from the approved [brand assets](design/brand/README.md).

> [!TIP]
> On Windows, if `pnpm tauri dev` fails with a cargo lock error, quit the running `rikki.exe` and try again.

## Use it

`Alt+Space` on Windows, `⌘K` on macOS. Rebind it in `settings`.

- **Enter** does the thing: copy, paste, launch, run.
- **Tab** does the second thing: preview an image, minify JSON, save a PNG, flip Base64.
- **Esc** backs out one step at a time, and hides the palette from an empty one.
- Losing focus hides the palette but keeps your query, so the next show picks up where you left off.

Every command also answers to its Chinese name and to its pinyin, so it can be found while an IME is still composing — `rili` reaches 万年历, `chongqi` reaches 重启. The whole vocabulary is in one table, `src/lib/commands/aliases.ts`.

## Commands

Type the prefix and a space to open its panel. Root search (no prefix) launches apps; a bare `#ff6363`, `rgb()` or `hsl()` opens the color panel.

| Prefix | Also | Enter | Notes |
| --- | --- | --- | --- |
| _(empty)_ | apps | Launch | An unmatched query of 2+ characters searches the web |
| `clip` | 剪贴板, 剪切板 | Paste the selected item | `Tab` previews images; `Shift+Delete` clears the unpinned ones |
| `sn` | `snippet`, `snip`, 片段, 常用语 | Copy the snippet | `sn add` or `Ctrl+N` creates one |
| `todo` | 待办, 待办事项 | Add an item | The panel stays open |
| `calc` | 计算器, 计算 | Copy the result | History is saved |
| `ann` | `anniversary`, `days`, 纪念日, 倒计时 | Edit the selected one, or create | Solar or lunar. Type a date to count down without saving: `1001`, `20261001`, `n1001` (lunar), `nr1001` (lunar leap month) |
| `cal` | `calendar`, `date`, 万年历, 日历 | Copy the date | Month grid with lunar dates. Arrows pick a day, PgUp/PgDn a month, Shift+↑↓ a year, Home goes to today; `cal 20261001` jumps |
| `em` | `emoji`, 表情 | Copy the glyph | Browse by category, then search in English |
| `tr` | `translate`, 翻译 | Translate, then copy on the next `Enter` | `Tab` cycles the target language |
| `color` | `clr`, 颜色 | Copy HEX | Also opens from a bare `#ff6363` |
| `json` | `jsonf`, 格式化 | Copy, or edit when invalid | `Tab` toggles pretty / compact |
| `b64` | `base64`, `b64e`, `encode`, 编码 | Copy | `Tab` flips to decode (`b64d`) |
| `ts` | `timestamp`, 时间戳 | Copy the main value | Unix seconds or millis, or `YYYY-MM-DD` |
| `qr` | `qrcode`, 二维码 | Copy the SVG | `Tab` saves a PNG |
| `qrd` | `qrdecode`, `scan`, 识码, 扫码 | Copy the payload | Reads the image on the clipboard |
| `settings` | `set`, 设置, 配置, `preferences` | Open a setting | See below |
| `gg` `bd` `bing` `ddg` `sogou` | 谷歌, 百度, 必应, 搜狗 | Search in the browser | |
| `lock` `sleep` `shutdown` `reboot` `logout` | 锁屏, 休眠, 关机, 重启, 注销; `restart`, `signout` | Run it | `shutdown`, `reboot` and `logout` ask for a second `Enter` |

The empty palette lists commands by how often you open them, with clipboard and snippets near the top until something else overtakes them.

## Settings

`settings` opens one list: search engine, browser, theme, hotkey, language, clipboard retention, cleanup of expired records, export / import, and check for updates.

Export writes todos, snippets and settings to a JSON file wherever you point it; import reads one back and asks before replacing anything. Clipboard history is not part of it.

Rikki updates itself. The last row checks GitHub Releases, verifies the download against a key baked into the app, and restarts into the new version. Neither package is code signed yet, so Windows shows SmartScreen's "unknown publisher" and macOS needs the quarantine flag cleared by hand: `xattr -cr /Applications/Rikki.app`.

## Stack

Tauri 2 (Rust) + SvelteKit 2 / Svelte 5 + Tailwind CSS 4. Everything persists in the OS app-data directory — `todos.json`, `snippets.json`, `settings.json`, `clipboard/` and so on. No `localStorage`.

## License

MIT. See [LICENSE](LICENSE).
