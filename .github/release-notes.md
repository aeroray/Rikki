## ✅ 待办 · Todos

- 待办现在可以带一个标签：`todo 买牛奶 #购物`
  Todos take one label: `todo 买牛奶 #购物`
- 输入 `#` 打开标签列表，每行显示该标签下的数量；`todo #购` 会边打边筛
  Type `#` to open the label list, each row showing how many items it holds; `todo #购` narrows it as you type
- `Ctrl+T` 把选中的待办移到别的标签，第一行是「无标签」
  `Ctrl+T` moves the selected todo to another label, with 无标签 as the first row
- 每行显示创建时间（「刚刚」「3 小时前」「3 天前」），超过一个月显示日期
  Each row shows its age — 刚刚, 3 小时前, 3 天前 — and a date past a month
- 列表统一单行，长内容按 `Tab` 展开看全文
  Rows are one line; `Tab` opens a long one in full
- 面板里那个多余的输入框去掉了——顶部输入框直接创建，方向键随时可用
  The panel's second input is gone: items are created from the field at the top, and the arrows work the whole time
- `Esc` 逐层退出：预览 → 标签列表 → 清掉标签或半截输入
  `Esc` unwinds a layer at a time: the preview, the label list, then the label or the half-typed item
- 底栏工具栏补上了，提示语跟着选中项变
  The panel gained a bottom bar, and its hints follow the selected row

## 🚀 开机自启动 · Launch at login

- 设置里新增「开机自启动」；登录后只出现托盘图标，不会弹出面板
  A new 开机自启动 row in settings; a login launch shows the tray icon and nothing else
- 状态由系统持有，每次打开设置都会重新读，所以在任务管理器里改过也能对上
  The OS holds the state, and the row re-reads it every time settings opens — a change made in Task Manager still shows up

## 🔄 更新检查 · Update checks

- 启动几秒后自动检查一次，不再只在打开面板时检查
  A check now runs a few seconds after launch, not only when the palette opens
- 检查过程在设置行里直接可见：转圈 +「正在检查更新…」，检查期间不再提示按 Enter
  The check is visible in its own settings row — a spinner and 正在检查更新… — and the Enter chip is withheld while it runs
- 检查失败会显示具体原因，不再只有一句「更新失败」
  A failed check prints the reason instead of only "failed"
- 有新版本时，底栏的提示可以点 `×` 关掉，而且只针对这一个版本
  The bottom bar's notice can be closed with `×`, for that version only

## 🔧 修复 · Fixes

- 设置列表底栏补上了 `Esc`；快捷键那一行的提示原本写的是「打开」，现在是「修改快捷键」
  The settings footer gained `Esc`, and the hotkey row now says 修改快捷键 rather than 打开
- 开机自启动那一行的提示语跟着状态走：「开启自启动」/「关闭自启动」
  The launch-at-login row's hint follows the state: 开启自启动 / 关闭自启动
- `todo #标签` 筛选时按 `Esc` 会直接退出命令，现在只退掉筛选
  `Esc` while filtering by label left the whole command; it now only clears the filter

---

## Download · 下载

- **Windows**: `*_x64-setup.exe` (NSIS; installer UI follows system language: Chinese / English)
  **Windows**：`*_x64-setup.exe`（NSIS；安装界面随系统语言自动中/英文）
- **macOS (Apple Silicon)**: `*_aarch64.dmg`
  **macOS（Apple Silicon）**：`*_aarch64.dmg`

Already on 1.1.0? This release is offered in the bottom bar on its own — or open **设置 → 检查更新** and confirm.
已经是 1.1.0 的用户：底栏会直接提示这次更新；也可以打开「设置 → 检查更新」手动确认。

⚠️ Neither package is code signed yet, so Windows shows SmartScreen's "unknown publisher" and macOS refuses the app until you clear the quarantine flag.
⚠️ 两个安装包都还没有代码签名，Windows 会提示「未知发布者」，macOS 需要先去掉隔离标记：

`/usr/bin/xattr -rd com.apple.quarantine /Applications/Rikki.app`
