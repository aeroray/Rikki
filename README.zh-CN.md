<p align="center">
  <img src="static/logo.png" width="96" height="96" alt="Rikki 浣熊图标">
</p>

<h1 align="center">Rikki</h1>

<p align="center">
  Windows 与 macOS 上的 Spotlight 风格启动器。<br>
  <a href="README.md">English</a>
</p>

Rikki 常驻托盘，按热键唤起一块玻璃面板。直接输入就是搜应用；输入前缀加空格，进入其他功能。名字取自 raccoon（浣熊），读音接近 quick。

## 能做什么

- **启动应用** — 输入名字的任意片段即可。带图标、支持拼音（`wx` → 微信），并按使用频率排序。
- **剪贴板历史** — 文本、图片和复制的文件。常用的可以固定；`Tab` 预览图片。
- **片段** — 存一次，用 `sn` 随时复制。复制时展开 `{{date}}`、`{{time}}`、`{{clipboard}}`。
- **转换工具** — 计算器、颜色、JSON、Base64、时间戳、二维码（生成，或从剪贴板识别）。
- **翻译** — 不需要任何 API Key。单词给词典卡片，整句给两条译文。
- **系统操作** — 锁屏、休眠、关机、重启、注销；`gg`、`bd`、`bing`、`ddg`、`sogou` 打开网页搜索。
- **中文 / English**、深色 / 浅色 / 跟随系统，热键可以自己改。

## 运行

需要 [pnpm](https://pnpm.io)、[Rust](https://rustup.rs)，以及对应系统的 [Tauri v2 环境](https://v2.tauri.app/start/prerequisites/)。

```bash
pnpm install
pnpm tauri dev      # 开发运行
pnpm tauri build    # 打包
```

`pnpm check` 做前端类型检查，`pnpm test` 跑单元测试。

`pnpm icons` 从已定稿的[品牌资源](design/brand/README.md)重新生成桌面图标、favicon 与 README Logo。

> [!TIP]
> Windows 上如果 `pnpm tauri dev` 报 cargo 锁文件错误，先退出正在运行的 `rikki.exe` 再试。

## 怎么用

Windows 是 `Alt+Space`，macOS 是 `⌘K`，可在 `settings` 里改。

- **Enter** 执行当前动作：复制、粘贴、启动、运行。
- **Tab** 是次要动作：预览图片、压缩 JSON、保存 PNG、切换 Base64 方向。
- **Esc** 逐层后退；在空面板上按才会隐藏。
- 失焦会隐藏面板但保留输入，下次唤起可以接着用。

每个命令同时认**中文名**和**拼音**，所以输入法还在组字时就能找到它——`rili` 能找到万年历，`chongqi` 能找到重启。完整词表集中在 `src/lib/commands/aliases.ts`。

## 命令

输入前缀再加空格即可打开对应面板。根搜索（无前缀）用来启动应用；直接输入 `#ff6363`、`rgb()` 或 `hsl()` 会打开颜色面板。

| 前缀 | 别名 | Enter | 说明 |
| --- | --- | --- | --- |
| _(空)_ | 应用 | 启动 | 未匹配且不少于 2 个字符时搜网页 |
| `clip` | 剪贴板、剪切板 | 粘贴选中项 | `Tab` 预览图片；`Shift+Delete` 清空未固定的记录 |
| `sn` | `snippet`、`snip`、片段、常用语 | 复制片段 | `sn add` 或 `Ctrl+N` 新建 |
| `todo` | 待办、待办事项 | 添加一条 | 面板保持打开 |
| `calc` | 计算器、计算 | 复制结果 | 保存历史 |
| `ann` | `anniversary`、`days`、纪念日、倒计时 | 编辑选中项，或新建 | 支持公历和农历。直接输入日期可算天数、不保存：`1001`、`20261001`、`n1001`（农历）、`nr1001`（农历闰月） |
| `cal` | `calendar`、`date`、万年历、日历 | 复制日期 | 带农历的月历。方向键选日期，PgUp/PgDn 换月，Shift+↑↓ 换年，Home 回今天；`cal 20261001` 跳转 |
| `em` | `emoji`、表情 | 复制表情 | 先按分类浏览，再用英文关键词搜索 |
| `tr` | `translate`、翻译 | 翻译，再按一次 Enter 复制 | `Tab` 切换目标语言 |
| `color` | `clr`、颜色 | 复制 HEX | 直接输入 `#ff6363` 也会打开 |
| `json` | `jsonf`、格式化 | 复制；无效时进入编辑 | `Tab` 在美化 / 压缩之间切换 |
| `b64` | `base64`、`b64e`、`encode`、编码 | 复制 | `Tab` 切换到解码（`b64d`） |
| `ts` | `timestamp`、时间戳 | 复制主值 | Unix 秒或毫秒，或 `YYYY-MM-DD` |
| `qr` | `qrcode`、二维码 | 复制 SVG | `Tab` 保存 PNG |
| `qrd` | `qrdecode`、`scan`、识码、扫码 | 复制内容 | 识别剪贴板里的图片 |
| `settings` | `set`、设置、配置、`preferences` | 打开一项设置 | 见下 |
| `gg` `bd` `bing` `ddg` `sogou` | 谷歌、百度、必应、搜狗 | 在浏览器中搜索 | |
| `lock` `sleep` `shutdown` `reboot` `logout` | 锁屏、休眠、关机、重启、注销；`restart`、`signout` | 立即执行 | 关机、重启、注销需要再按一次 Enter 确认 |

空面板按使用次数排命令，剪贴板和片段默认靠前，被用得更频繁的会顶上来。

## 设置

`settings` 打开一个列表：搜索引擎、默认浏览器、主题、热键、语言、剪贴板保留、清理过期记录、导出 / 导入配置，以及检查更新。

导出会把待办、片段和设置写到你指定的 JSON 文件；导入会先读回来、确认之后才替换。剪贴板历史不包含在内。

Rikki 支持应用内更新。最后一行会检查 GitHub Releases，用内置在应用里的公钥校验下载包，然后重启到新版本。目前两个安装包都没有做代码签名，所以 Windows 会提示"未知发布者"，macOS 需要手动去掉隔离标记：`xattr -cr /Applications/Rikki.app`。

## 技术栈

Tauri 2（Rust）+ SvelteKit 2 / Svelte 5 + Tailwind CSS 4。数据都存在系统应用数据目录——`todos.json`、`snippets.json`、`settings.json`、`clipboard/` 等，不使用 `localStorage`。

## 许可

MIT，见 [LICENSE](LICENSE)。
