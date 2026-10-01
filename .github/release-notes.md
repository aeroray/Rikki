## 🦝 第一个正式版本 · First release

- 热键唤起一个玻璃质感的面板，输入即启动应用；输入前缀加空格进入其他功能
  A hotkey opens a glass palette: type to launch an app, or a prefix and a space for everything else
- 应用按使用频率排序，带图标并支持拼音匹配（`wx` → 微信）
  Apps rank by how often you open them, with icons and pinyin matching (`wx` → 微信)
- 输入 2 个以上字符直接网页搜索，`gg` `bd` `bing` `ddg` `sogou` 可指定引擎
  Unmatched queries of 2+ characters search the web; `gg` `bd` `bing` `ddg` `sogou` pick the engine

## 📋 剪贴板 · Clipboard

- 保留文本、图片和复制的文件；常用的可以固定，`Tab` 预览图片
  Keeps text, images and copied files; pin what you want to keep, and `Tab` previews an image
- 单条文本上限 512k 字符，图片最多 200 张、单张 5MB；过期清理是手动动作，不会自动删除
  A single body over 512k characters is skipped, images cap at 200 files and 5MB each, and expired records are only removed when you run the cleanup yourself

## 🧩 命令 · Commands

- 片段（`sn`）、待办（`todo`）、计算器（`calc`）、纪念日（`ann`）、万年历（`cal`）、表情（`em`）
  Snippets (`sn`), todos (`todo`), calculator (`calc`), anniversaries (`ann`), calendar (`cal`), emoji (`em`)
- 转换工具：颜色、JSON、Base64、时间戳、二维码（生成，或从剪贴板识别）
  Converters: color, JSON, Base64, timestamps, QR codes (make one, or read one from the clipboard)
- 翻译（`tr`）不需要任何 API Key：单词给词典卡片，整句给两条译文
  Translate (`tr`) needs no API key: a word gets a dictionary card, a sentence gets two translations
- 系统操作：锁屏、休眠、关机、重启、注销；后三个需要再按一次 Enter
  System: lock, sleep, shutdown, reboot, logout; the last three ask for a second Enter
- 每个命令也认中文名和拼音，输入法还在拼写时就能找到（`rili` → 万年历，`chongqi` → 重启）
  Every command also answers to its Chinese name and to its pinyin, so it can be found while an IME is still composing (`rili` → 万年历, `chongqi` → 重启)

## ⚙️ 设置 · Settings

- 主题可以跟随系统，也可以固定为亮色或暗色；默认跟随系统
  The theme can follow the system or be pinned to light or dark; following the system is the default
- 中文 / English，热键可改，剪贴板保留 7 天 / 30 天 / 永不
  Chinese / English, a rebindable hotkey, and clipboard retention of 7 days, 30 days or never
- 导出 / 导入配置：待办、片段和设置写进一个 JSON 文件，导入前会先确认
  Export / import: todos, snippets and settings go to a JSON file, and importing asks before replacing anything

## 🔄 更新 · Updates

- 应用内更新：设置最后一行会检查 GitHub Releases，用内置在应用里的公钥校验下载包，然后重启到新版本
  In-app updates: the last settings row checks GitHub Releases, verifies the download against a key baked into the app, and restarts into the new version

---

## Download · 下载

- **Windows**: `*_x64-setup.exe` (NSIS; installer UI follows system language: Chinese / English)
  **Windows**：`*_x64-setup.exe`（NSIS；安装界面随系统语言自动中/英文）
- **macOS (Apple Silicon)**: `*_aarch64.dmg`
  **macOS（Apple Silicon）**：`*_aarch64.dmg`

Already installed? Open **设置 → 检查更新** and confirm — it downloads and restarts for you.
已安装用户打开「设置 → 检查更新」确认即可，会自动下载并重启。

⚠️ Neither package is code signed yet, so Windows shows SmartScreen's "unknown publisher" and macOS refuses the app until you clear the quarantine flag.
⚠️ 两个安装包都还没有代码签名，Windows 会提示「未知发布者」，macOS 需要先去掉隔离标记：

`/usr/bin/xattr -rd com.apple.quarantine /Applications/Rikki.app`
