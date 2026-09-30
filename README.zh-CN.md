<p align="center">
  <img src="src-tauri/icons/128x128.png" width="96" height="96" alt="Rikki">
</p>

<h1 align="center">Rikki</h1>

<p align="center">
  Windows 与 macOS 上的 Spotlight 风格启动器。<br>
  <a href="README.md">English</a>
</p>

Rikki 常驻托盘，热键唤起一块玻璃搜索面板。直接输入即可打开已安装的应用；输入前缀加空格，则进入剪贴板、片段、转换工具和系统操作。名字取自 raccoon（浣熊），读音接近 quick。

## 功能

- **应用搜索**：空主页即可搜应用，带图标、按启动次数排序，并支持拼音（`wx` → 微信）。没有 `open` 前缀。
- **前缀命令**：剪贴板、片段、待办、计算器、纪念日、emoji、翻译、颜色、JSON、Base64、时间戳、二维码。
- **网页搜索**：`gg`、`bd`、`bing`、`ddg`、`sogou`，或任意 2 个字符以上的未匹配查询（使用设置里的默认引擎）。
- **常驻进程**：面板隐藏后托盘图标仍在，热键始终可用。
- **简体中文 / English**：跟随系统或在设置里指定。支持深色、浅色主题。

## 开发

需要 [pnpm](https://pnpm.io)、[Rust](https://rustup.rs)，以及对应系统的 [Tauri v2 环境](https://v2.tauri.app/start/prerequisites/)。

```bash
pnpm install
pnpm tauri dev
```

前端类型检查：`pnpm check`。

> [!TIP]
> 在 Windows 上，若 `pnpm tauri dev` 因 cargo 锁文件失败，先退出正在运行的 `rikki.exe` 再试。

## 快捷键

| 操作 | Windows | macOS |
| --- | --- | --- |
| 显示 / 隐藏面板 | `Alt+Space` | `⌘K` |
| 隐藏 | 点到面板外，或再按一次热键 | 相同 |
| 改绑定 | `settings` → 热键 | 相同 |

默认组合和其他启动器类似。若和别的软件冲突，到设置里改掉即可。

## 命令

输入前缀再加空格，打开对应面板。根搜索（无前缀）用来启动应用。直接输入 hex、`rgb()` 或 `hsl()` 也会打开颜色面板。

| 前缀 | 别名 | Enter | 说明 |
| --- | --- | --- | --- |
| _(空)_ | 应用 | 启动 | 未匹配且不少于 2 个字符时，用默认引擎搜网页 |
| `clip` | | 粘贴选中项 | `Tab` 预览图片；`Shift+Delete` 清空未置顶历史 |
| `sn` | `snippet` | 复制片段 | `sn add` 或 `Ctrl+N` 新建；复制时展开 `{{date}}` / `{{time}}` / `{{clipboard}}` |
| `todo` | | 添加待办 | 面板保持打开 |
| `calc` | | 复制结果 | 保存历史 |
| `ann` | `anniversary` | 编辑选中项，或新建 | 生日与纪念日，支持公历和农历。直接输入日期即可算天数、不保存：`1001`、`20261001`、`n1001`（农历）、`nr1001`（农历闰月） |
| `em` | `emoji` | 复制表情 | 先浏览分类，再用英文关键词搜索 |
| `tr` | `translate` | 翻译，再复制 | 在设置里填写百度翻译 AppID 和密钥 |
| `color` | `clr` | 复制 HEX | 直接输入 `#ff6363` 也可以 |
| `json` | `jsonf` | 复制；无效时进入编辑 | `Tab` 在美化 / 压缩之间切换 |
| `b64` | `base64` | 复制 | `Tab` 切换到解码（`b64d`） |
| `ts` | `timestamp` | 复制主值 | Unix 秒 / 毫秒，或 `YYYY-MM-DD` |
| `qr` | `qrcode` | 复制 SVG | `Tab` 保存 PNG |
| `qrd` | `qrdecode` | 复制内容 | 识别剪贴板里的图片 |
| `settings` | | 打开一项设置 | 主题、热键、语言、翻译 API、剪贴板保留、备份 |
| `gg` `bd` `bing` `ddg` `sogou` | | 在浏览器中搜索 | |
| `lock` `sleep` `shutdown` `reboot` `logout` | | 立即执行 | |

主页命令按使用次数排序。剪贴板和片段在次数相同时装在前面。

## 交互

- **Enter** 完成当前命令：复制、粘贴、启动、翻译或执行。
- **Tab** 是次要操作（图片预览、压缩 JSON、保存 PNG、切换 Base64 方向）。
- **Esc** 先关掉浮层和子页面，再清空输入回到空主页。在空主页再按 Esc 才会隐藏面板。
- 失焦或再按唤起热键会隐藏面板，**不**清空输入，方便回来继续。
- 启动应用、复制或打开网页搜索后，下次显示会重置查询。
- 方向键在列表里移动选中项。转换类面板只用搜索框。

## 设置

输入 `settings` 打开。除主题、语言和热键外还有：

- **搜索引擎** — 内置引擎，以及带 `%s` 的自定义 `http(s)` 地址。
- **翻译** — 百度翻译 AppID、密钥，以及默认 / 第二目标语言。输入即保存。
- **剪贴板保留** — 7 天、30 天或永不。过期未置顶文本要在设置里手动清理，不会自动删。
- **备份** — 导出 / 导入待办、片段和设置的 JSON。不含剪贴板历史。

> [!NOTE]
> `tr` 会在应用内请求百度翻译接口。没有 AppID 和密钥时，翻译面板无法发起请求。

## 技术栈

Tauri 2（Rust）+ SvelteKit 2 / Svelte 5 + Tailwind CSS 4。数据写在系统应用数据目录（`todos.json`、`snippets.json`、`settings.json`、剪贴板索引和图片等），不用 `localStorage`。
