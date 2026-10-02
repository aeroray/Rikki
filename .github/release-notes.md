## 📋 剪贴板 · Clipboard

- 记录按日期分组：今天 / 昨天 / 具体日期
  Entries are grouped by day: 今天 / 昨天 / a date
- 每行右侧加了删除按钮（`Delete` 键本来就能删单条，但没有可见的入口）
  Each row gained a delete button — the `Delete` key already removed one, but nothing on screen said so
- 左侧图标和主列表统一成同一种方块样式，图片缩略图一起对齐
  The leading glyph now uses the same tile as the main list, image thumbnails included

## ✅ 成功色 · A success colour

- 更新提示前面的箭头改成了绿色
  The arrow on the update notice is green
- 「已切换到…」「已创建…」「已导出…」这类结果提示前面多了一个绿色对勾
  Results that worked — a language switched, a snippet created, an export written — now carry a green check
- 失败提示**不会**变红：红色在这个设计里只表示「不可撤销」
  Failures are deliberately not painted red — that colour means "this cannot be undone" and nothing else

## 🔧 修复 · Fixes

- `todo #标签` 筛选时按 `Esc` 会退出整个命令，现在只退掉筛选
  `Esc` while filtering todos by label left the whole command; it now only clears the filter

---

## Download · 下载

- **Windows**: `*_x64-setup.exe` (NSIS; installer UI follows system language: Chinese / English)
  **Windows**：`*_x64-setup.exe`（NSIS；安装界面随系统语言自动中/英文）
- **macOS (Apple Silicon)**: `*_aarch64.dmg`
  **macOS（Apple Silicon）**：`*_aarch64.dmg`

Already on 1.1.1? This release is offered in the bottom bar on its own — or open **设置 → 检查更新** and confirm.
已经是 1.1.1 的用户：底栏会直接提示这次更新；也可以打开「设置 → 检查更新」手动确认。

⚠️ Neither package is code signed yet, so Windows shows SmartScreen's "unknown publisher" and macOS refuses the app until you clear the quarantine flag.
⚠️ 两个安装包都还没有代码签名，Windows 会提示「未知发布者」，macOS 需要先去掉隔离标记：

`/usr/bin/xattr -rd com.apple.quarantine /Applications/Rikki.app`
