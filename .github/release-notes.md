## 🖥️ 系统状态 · System monitor

- 新命令 `sys`：实时查看 CPU（每个核心一条）、内存、显卡和占用最高的进程
  New `sys` command: live CPU with a bar per core, memory, GPU and the busiest processes
- 显卡按类型分区，独立显卡和核心显卡各占一块，名称取自系统枚举而不是「GPU 0」
  GPUs are grouped by kind — discrete and integrated each get their own block, named from the system rather than "GPU 0"
- 每条曲线保留最近一分钟，数字和走势一起看
  Each figure keeps a minute of history, so the number and its trend read together

## ⏻ 定时关机 · Scheduled power

- 锁屏、休眠、关机、重启、注销都可以「几分钟后」或「几点」执行
  Lock, sleep, shutdown, reboot and logout can all run after a delay or at a time
- 选预设，或直接输入：`30`、`1h30m`、`23:00`
  Pick a preset, or just type it: `30`, `1h30m`, `23:00`
- 底栏显示倒计时，`Ctrl+Z` 在任何界面都能取消
  A countdown sits in the bottom bar, and `Ctrl+Z` cancels it from anywhere
- 立即关机 / 重启 / 注销仍会先确认；锁屏和休眠不会，因为一步就能回来
  Immediate shutdown, restart and logout still ask first; lock and sleep do not, because one keystroke gets you back

## 🔄 后台更新 · Background updates

- 打开面板时自动检查新版本，六小时一次，不用再手动点
  Opening the palette checks for a release automatically, once every six hours
- 有新版本时底栏直接提示，`Ctrl+U` 即可安装
  A new version shows in the bottom bar, and `Ctrl+U` installs it

## 📋 剪贴板 · Clipboard

- `Tab` 现在可以预览任意一条：文本、图片、复制的文件和颜色
  `Tab` now previews any entry: text, images, copied files and colours
- 长文本可以滚动查看
  Long text scrolls
- 颜色面板支持方向键，包括在最近颜色之间移动
  The colour panel takes the arrow keys, including through recent colours

## 📅 纪念日 · Anniversaries

- 公历可以一键转成农历
  A solar date converts to lunar with one key
- 闰月会问你要不要用，不用自己输 `r`
  The leap month is offered rather than typed as an `r`
- 农历纪念日的信息行以它自己的日历开头
  A lunar anniversary leads with its own calendar

## 🎨 界面 · Interface

- 搜索框左侧的图标跟着当前命令变——设置显示齿轮，万年历显示日历
  The field's glyph follows the command: a gear for settings, a calendar for the calendar
- 弹层、确认框和预览都加了背景模糊
  Overlays, dialogs and the preview are blurred behind
- 大写锁定时会提示（输入法中英文状态无法可靠读取，已放弃）
  Caps Lock is shown (the IME's Chinese/English mode cannot be read reliably, so it was dropped)
- 应用图标去掉了快捷方式箭头，选中后可以打开所在文件夹
  App icons no longer wear the shortcut arrow, and a selected row can reveal its folder

## ⚡ 性能 · Performance

- 启动时不再预读整机状态，冷启动快了约 400ms
  Startup no longer pre-reads the whole machine, about 400ms faster
- 面板关掉就停止采样，常驻托盘不再空转
  Sampling stops when the panel closes, so a tray app idles instead of polling
- 进程列表每 3 秒刷新一次，不再每秒遍历一遍
  The process list refreshes every three seconds rather than every second

## 🍎 macOS

- 不再占用 Dock，作为菜单栏应用运行
  No Dock icon; it runs as a menu-bar app
- 菜单栏图标左键展开菜单（平台惯例）；Windows 仍是左键唤起面板
  The menu-bar icon opens its menu on a left click, as the platform expects; Windows still opens the palette on a left click
- 快捷键提示在 macOS 上显示 ⌘
  Shortcut labels show ⌘ on macOS

## 🔧 修复 · Fixes

- 应用列表会在运行期间重新扫描，新装的软件不用重启就能搜到
  The app list is re-scanned while running, so software installed since launch is found without a restart
- 定时任务的倒计时不会再偶尔不显示
  A scheduled countdown no longer occasionally fails to appear
- 取消更新确认框不再泄漏下载句柄
  Cancelling the update dialog no longer leaks the download handle

---

## Download · 下载

- **Windows**: `*_x64-setup.exe` (NSIS; installer UI follows system language: Chinese / English)
  **Windows**：`*_x64-setup.exe`（NSIS；安装界面随系统语言自动中/英文）
- **macOS (Apple Silicon)**: `*_aarch64.dmg`
  **macOS（Apple Silicon）**：`*_aarch64.dmg`

Already on 1.0.0? Rikki now checks in the background, so the update appears in the bottom bar on its own — or open **设置 → 检查更新** and confirm.
已经是 1.0.0 的用户：现在会自动后台检查，底栏会直接提示；也可以打开「设置 → 检查更新」手动确认。

⚠️ Neither package is code signed yet, so Windows shows SmartScreen's "unknown publisher" and macOS refuses the app until you clear the quarantine flag.
⚠️ 两个安装包都还没有代码签名，Windows 会提示「未知发布者」，macOS 需要先去掉隔离标记：

`/usr/bin/xattr -rd com.apple.quarantine /Applications/Rikki.app`
