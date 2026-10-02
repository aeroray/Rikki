## 🖥️ 系统状态 · System monitor

- `sys` 新增磁盘、网络和显卡之外的整机读数，并排成两栏：左边磁盘，右边网络
  `sys` gained disk and network readings, laid out in two columns: disk on the left, network on the right
- 磁盘按 `C 盘` / `D 盘` 显示，C 盘在前；每个卷给出可用空间和占用百分比
  Disks are listed as `C 盘` / `D 盘` with the system drive first, each showing its free space and how full it is
- 网络分成**下载**和**上传**两张独立的图，各自一条曲线
  Network is two separate charts, **download** and **upload**, each with its own line
- 网络空闲时不再整块消失（之前只在有流量时显示）
  The network section no longer disappears when the network is idle
- 底栏信息补齐：网卡数量与累计流量、磁盘读写速率
  The columns carry more of what they measure: interface count and lifetime traffic, disk read and write rates

## ✂️ 片段 · Snippets

- 新建和编辑片段时，`↑↓` 可以在标题、关键词、正文和「敏感」之间切换（两端循环）
  `↑↓` now moves between title, keyword, body and the sensitive checkbox when creating or editing a snippet, wrapping at both ends
- 正文框里箭头优先移动光标，到首行或末行才切换字段
  In the body the arrows move the caret first, and only change field at the very top or bottom

## 🔧 修复 · Fixes

- 磁盘和网络空闲时读数不再闪动：之前空闲的网卡会被过滤掉，整块网络信息会消失再出现
  Disk and network readings no longer flicker when idle — an idle adapter used to be filtered out, so the whole network block vanished and reappeared

---

## Download · 下载

- **Windows**: `*_x64-setup.exe` (NSIS; installer UI follows system language: Chinese / English)
  **Windows**：`*_x64-setup.exe`（NSIS；安装界面随系统语言自动中/英文）
- **macOS (Apple Silicon)**: `*_aarch64.dmg`
  **macOS（Apple Silicon）**：`*_aarch64.dmg`

Already on 1.1.2? This release is offered in the bottom bar on its own — or open **设置 → 检查更新** and confirm.
已经是 1.1.2 的用户：底栏会直接提示这次更新；也可以打开「设置 → 检查更新」手动确认。

⚠️ Neither package is code signed yet, so Windows shows SmartScreen's "unknown publisher" and macOS refuses the app until you clear the quarantine flag.
⚠️ 两个安装包都还没有代码签名，Windows 会提示「未知发布者」，macOS 需要先去掉隔离标记：

`/usr/bin/xattr -rd com.apple.quarantine /Applications/Rikki.app`
