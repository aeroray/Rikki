# Decisions

Entries are newest first.

## 2026-10-02 - The update bar can be closed, and closing is remembered per version
Decision:
`UpdateBar` carries an `×` at the far right. `UpdateStore.dismiss()` clears `available`, **keeps** the held `Update`, and writes the version to `settings.json` as `dismissedUpdateVersion` — a new field, with `SETTINGS_VERSION` moved from 7 to 8. A release whose version equals that string is still held and still installable from the settings row, but is not announced again.
Reason:
"关闭掉这一条提示" has to survive a restart to mean anything. The check runs once per launch, so a dismissal held only in memory would put the same bar back within seconds of the next start, and the button would read as broken — the exact complaint it exists to answer. Keeping the handle rather than closing it is what separates "not now" from "not ever": the settings row's own check goes through the confirmation dialog and never touches `available`, so a closed notice does not take the install away with it. Per version rather than a boolean, so the next release is announced without anything having to clear the flag first.
Note:
The field rides along in the export/import file, because it lives on `Settings` like every other preference — importing a configuration therefore imports which release that configuration had closed, which is the same rule the other three sections follow and not worth a special case. `update.dismiss` is both the `aria-label` and the `title`, since an icon-only button has no text to read. Verified: `svelte-check` clean, 94 frontend tests and the Rust suite passing; the button itself is unverified in the running app.

## 2026-10-02 - The update check runs at launch, and its bar stacks under the countdown
Decision:
`UpdateStore.start()` runs one check per process, three seconds into the launch and outside `CHECK_INTERVAL`; the palette opening still re-checks on the six-hour throttle, and both triggers now share one `run()`. The footer's update line became `UpdateBar`, a component of its own rendered by `EmptyState`, `ResultList` and `TodoList` as well as by `PanelFooter`, and it stacks *below* `PendingPowerBar` instead of being replaced by it. A failed check on the settings row prints the plugin's reason, not only "failed".
Reason:
Two faults with one symptom. The check only ever ran from `palette-shown`, so a release could be discovered only by the act of searching for something else. And the answer was drawn by `PanelFooter`, which the empty state and the root list do not render — so the panel a user opens first, with nothing typed, was the one place an update could not be seen. The priority question is real but the two bars are not alternatives: a pending shutdown outranks an update because the machine is about to close everything, yet hiding the update until the timer fires is the one case where the user cannot act on it in time. Stacking answers both — the countdown keeps the top row, the update stays visible and installable underneath it.
Note:
The launch check is deliberately not throttled: `CHECK_INTERVAL` exists so that opening the palette twenty times in a day still asks once, and the first check of a process is not a repeat of anything. It does stamp `lastCheck`, so a palette opening just after a launch does not ask again. Verified with `svelte-check` clean and 94 tests passing; the two bars stacking is reasoned from the markup, not yet seen in the running app.

## 2026-10-02 - The update endpoint answers 404, and no code change can fix that
Decision:
No change yet. Recorded because it is the answer to "the update check has never once succeeded", and it is not in this repository: `https://github.com/aeroray/Rikki/releases/latest/download/latest.json` returns **404 to any client that is not signed in**, because `aeroray/Rikki` is a **private** repository. The two public projects beside it answer 200 on the same URL with the same shape of manifest.
Reason:
Measured three ways rather than inferred. Anonymous `GET` of the endpoint: 404 for Rikki, 200 for Museek and SkillSage. `gh api /repos/aeroray/Rikki` with an authenticated token for a *different* account: 404, while `/users/aeroray/repos` lists three public repositories and Rikki is not one of them. And `ssh -T git@github-aeroray` authenticates as `aeroray`, so the repository exists and the SSH remote works — it is the anonymous HTTPS asset URL the updater needs that does not.
Note:
The updater has no way to authenticate a release download: the endpoint is a plain HTTPS GET from the plugin, so a private repository can never serve it, and the failure is a bare 404 inside `check()` that the frontend swallowed. Two things are *not* the cause and were checked before blaming the network: the minisign public key in `tauri.conf.json` matches `~/.tauri/rikki-updater.key.pub` byte for byte, and `relaunch()` calls `plugin:process|restart`, which `process:allow-restart` in the capability already grants. Publishing the release is a second, independent gate — `tauri-action` writes it as a **draft**, and `/releases/latest` skips drafts — so a repository made public would still need the release published by hand.

## 2026-10-01 - The vocabulary test has to import every command
Decision:
`aliases.test.ts` imports `$lib/commands/sysmon`, and `COMMAND_ALIASES` gained a `sysmon` entry (`monitor`, 系统, 系统状态, 监控, 性能).
Reason:
The test asserts that every *registered* command has an alias entry, but it can only see the commands it imports — and `sysmon` was not among them. So the assertion passed while the system monitor had no aliases at all and was reachable only by typing its Latin prefix. A coverage check over a set the test assembles itself is only as complete as its imports, and a missing import fails open: it makes the check greener, not redder.
Note:
Both READMEs were also brought back in step with the app: the `sys` command was missing from the table entirely, clipboard `Tab` was described as previewing only images when it previews text, files and colours too, the system row still said the three destructive commands ask for a second Enter rather than describing the delay panel, the update row did not mention the six-hour background check or `Ctrl+U`, and the macOS menu-bar behaviour and the tray's per-platform left click were undocumented. Verified against the code rather than memory: `show_menu_on_left_click(cfg!(target_os = "macos"))` for the tray, `previewFor` for the four preview kinds, and a throwaway test that all six new spellings resolve to `sysmon`.

## 2026-10-01 - The countdown bar carries its own icon, and appears on every view
Decision:
`PendingPowerBar` looks its glyph up from the pending action — `Lock`, `Moon`, `Power`, `RotateCw`, `LogOut` — instead of drawing a fixed one, and it is rendered by the empty state and by `TodoList` as well as by `PanelFooter` and `ResultList`.
Reason:
Two faults with the same shape: the bar knew less about the timer than the panel that set it. A hardcoded power symbol said "shutdown" while the machine was going to sleep, and only the views that happened to render a footer showed it at all — the empty state, which is the panel a user opens first and with nothing typed, showed nothing. A countdown the user cannot see is a countdown they cannot cancel, so it belongs on every view rather than only the ones that already had a bar to hang it on.
Note:
`PanelFooter` already delegates to this component, so every panel that uses it was covered; the gaps were exactly the three views that render no footer at all — `EmptyState`, `ResultList` and `TodoList`. In `TodoList` the bar sits outside the padded wrapper, because it draws its own full-width top border and an inset parent would cut it short. Verified in the running app with nothing typed: `⏻ 休眠将在 15 分钟 后执行` with the moon glyph for a sleep, and `⇥ 注销将在 15 分钟 后执行` with the sign-out glyph for a log out.

## 2026-10-01 - All five system commands take a delay, and the countdown is generation-guarded
Decision:
`lock`, `sleep`, `shutdown`, `reboot` and `logout` all open the same delay panel. Only shutdown and restart use an OS timer; lock, sleep and logout run from a thread that sleeps first, because the OS offers no scheduled form of them and log out has no way to abort one. `needsConfirm` decides the dialog: never for a delay, and on an immediate action only for shutdown, restart and log out.
Reason:
The commands each had their own immediate behaviour, and "in an hour" is one answer for all five rather than five features. The confirm rule follows the same question as before — can this be taken back? A lock or a sleep is one keystroke from where the user was, so it never asks; the other three end the session and take unsaved work with them. A delay never asks for any of them, because the footer's countdown and its `Ctrl+Z` are the safety net.
Note:
The footer bug was a race, not a rendering fault: `watch()` read `pending_power` while a schedule was still in flight, the read answered "nothing pending", and that stale answer was written over the timer that had just been set — stopping the poll with it. The store now carries a generation counter, bumped on every schedule and cancel, and a response whose generation is stale is dropped. Verified: `sleep` + 立即 slept the machine with no dialog (event 42 then 107 in the system log), while `logout` + 立即 showed 确认立即注销？; and the countdown appeared on the root list, which has no `PanelFooter` of its own.

## 2026-10-01 - Shutdown and restart take a delay, chosen from a panel
Decision:
`shutdown` and `reboot` open a panel instead of running at once. It lists `立即` first and then 15m / 30m / 1h / 2h / 4h, each with the wall-clock time it lands on; typing adds a `自定义时间` row at the top, which Enter takes. `30` reads as minutes, `1h30m` as a duration, `23:00` as the next time that clock occurs. A pending timer shows a countdown bar with `Ctrl+Z` to cancel.
Reason:
The immediate action was the only behaviour before, so it leads rather than being dropped. A delay is cancellable and so needs no dialog, while `立即` keeps the confirmation the command always had — the distinction is exactly "can this be taken back". The wall-clock column is the point of the list: `2 小时` is harder to place than `14:00`, and it is what the user checks before agreeing to lose their session. A typed value leads because the user who typed it is the one who wants it, and Enter takes the first row.
Note:
Two findings worth keeping. The OS does not publish a pending schedule: the registry key this first tried does not exist, and `shutdown.exe` reveals one only by *refusing* a second with exit 1190 — so the app remembers what it set, and `cancel_power` still asks the OS, which is why it also stops a timer set from a terminal. And `PanelFooter` only renders inside panels, so the root list had no footer at all: a shutdown scheduled an hour ago would have been invisible from the view the user is most often in. The countdown is its own component, rendered by both. Verified end to end: Enter scheduled a real shutdown (`shutdown /a` returned 0), the bar read `关机将在 15 分钟 后执行`, and `Ctrl+Z` cancelled it (`/a` then returned 1116).

## 2026-10-01 - The loading effect belongs on the chart, not on the page
Decision:
`figure` draws a pulsing placeholder in the chart's own `h-8` box while `values.length < 2`, and the panel renders nothing at all before the first reading. The page-level skeleton is gone.
Reason:
`sysmon.stats` lives on the store and outlives the panel, so `!stats` is only ever true for the very first open of a process, for about one IPC round trip — a page of grey boxes for a few milliseconds reads as a flash. What is genuinely empty for longer is each chart, because a sparkline needs two readings and shows nothing until the second one arrives; that is where a loading state earns its place. The box is `h-8` either way, so the line appears without moving anything.
Note:
This also fixed a `路` that had shipped in the CPU detail line: the separator was written as `" · "` and a PowerShell round-trip turned the middle dot into `路`. See the entry below for why that kept happening.

## 2026-10-01 - Do not rewrite UTF-8 sources through PowerShell
Decision:
Source files in this repository are only ever edited with the `edit` tool. `Set-Content`/`Get-Content -Raw` round-trips are forbidden for anything containing non-ASCII.
Reason:
PowerShell on this machine reads UTF-8 files as ANSI, which breaks in both directions. Writing corrupts the file — a middle dot became `路`, an em-dash became `鈥?`, `显卡` became `鏄惧崱`, and `↑↓` became `鈫戔啌`; several of those shipped in a commit. And *reading* corrupts the check: `Select-String` for mojibake patterns reported corruption in files that were clean, so "fixes" were applied to text that had nothing wrong with it, each pass adding more damage. `read` and `grep` decode UTF-8 correctly and are the only reliable way to inspect these files. A `grep` for the mojibake patterns is the right verification; a PowerShell one is worse than no check at all.

## 2026-10-01 - The panel groups GPUs by kind, and loads as a skeleton
Decision:
One section per GPU kind — 独立显卡 first, then 核心显卡 — each carrying its adapter's name beside the heading and its number on the same line. The kind is the heading, so a machine with one card reads "独立显卡  NVIDIA GeForce RTX 4060  7%" rather than a generic 显卡 over an anonymous row. A machine with no reading yet shows skeleton boxes in the shapes the content will take.
Reason:
The two kinds are different hardware answering different questions, and a laptop with both wants to know which is which before reading either number; an empty kind is dropped so a desktop shows one section. The skeleton replaces the old "正在读取…" line, which occupied one row and then let the layout jump to a dozen when the first reading landed — the boxes reserve the real heights, so nothing moves.
Note:
The heading alignment is `items-start` plus `leading-none`, and both halves matter. `items-baseline` lined the 11px label's baseline up with the 20px number's, which read as the label floating mid-row; `items-start` alone still left the caps 4px low, because the label carried a 20px line-height against an 11px font and its half-leading pushed it down. Measured after: 1px apart. `shortBrand` also has a case worth keeping — stripping the bare word "Core" before the count left "Ryzen 7 5800X 8-", so `\d+\s*-\s*cores?` is removed first. Seven tests cover it.

## 2026-10-01 - Review fixes: the sampler is lazy, and the panel stops when hidden
Decision:
`Monitor` holds a `OnceLock<Mutex<Inner>>` and builds its sampler on the first snapshot; `Inner::new` uses `System::new()` rather than `new_all()`. `SysmonPanel` starts and stops sampling from an `$effect` on `ui.shellOpen`, not from `onMount`. The PDH buffer is `Vec<u64>` rather than `Vec<u8>`. `update.close()` is now called when a held update is discarded, and `ui.requestConfirm` takes an optional `oncancel`.
Reason:
Four separate faults, all found by review and each measured or traced rather than guessed. `System::new_all()` cost **429ms** on this machine against **0.3ms** for `System::new()` — a 1268× difference paid on the main thread at startup by every user, including those who never open the panel; the process list is filled by the first snapshot anyway. The polling timer was tied to mount/unmount, but hiding the palette only fades the shell, so the panel stays mounted and for a tray app hidden is the normal state — the machine was being read every second forever. Measured after the fix: **0.000s of CPU over 7.5 seconds while hidden**. `vec![0u8; size]` asks for alignment 1 and was cast to a struct needing 8; malloc happens to over-align so it never crashed, but the cast is what the compiler is told to trust. And a cancelled update dialog dropped the `Update` handle without `close()`, which the plugin's own docs require.
Note:
The PowerShell `Set-Content -Encoding UTF8` round-trip corrupted em-dashes and Chinese in six source files and both i18n catalogs — it reads as ANSI. Every one was restored with `git checkout` and redone with the `edit` tool. Never rewrite a UTF-8 source file through PowerShell here; `edit` is the only safe path.

## 2026-10-01 - macOS: no Dock icon, menu on left click, and Cmd in the labels
Decision:
`set_activation_policy(Accessory)` at setup so the app is a menu-bar app. The tray takes `show_menu_on_left_click(cfg!(target_os = "macos"))` and only shows the palette on a left click off macOS. `primaryModifier()` / `primaryShortcut()` in `engines.ts` supply the platform's own modifier, and the three hint strings take it as `{mod}`.
Reason:
The app had no `Accessory` policy, so macOS would show a Dock icon for an app whose only window is a hidden borderless palette. A menu-bar icon's left click opens its menu on macOS — and that menu is the only place Quit lives — so taking the click for the palette left Quit on a right click, which is not the platform's convention. Separately, every keyboard handler already accepted `metaKey`, but fifteen chips, hints and footers hardcoded "Ctrl+", telling a Mac user to press a key that does nothing there.
Note:
Verified on Windows only: `Ctrl+N 添加` still renders, `svelte-check` clean, 105 Rust tests pass. The macOS paths are read and reasoned about, never executed — there is no Mac here. The hand-written IOKit FFI in `sysmon.rs` does typecheck for `aarch64-apple-darwin` in isolation, but the full cross-build cannot run without an Apple C toolchain.

## 2026-10-01 - GPUs are named from DXGI, and virtual adapters are dropped
Decision:
`gpu::usage` matches each PDH counter LUID against DXGI's adapter list and keeps only the ones it finds, taking the description and a discrete/integrated kind from there. A LUID the counters report but DXGI does not is dropped.
Reason:
The panel said "GPU 0" and "GPU 1", which tell nobody which is which, and then said "交换" above them because the swap row sat between memory and the GPUs and read as their heading. Two separate faults. For the naming, the counters carry a LUID and nothing else, so DXGI is the only source of a product name. For the count, the GPU Engine counters also exist for virtual display adapters: MuMu and GameViewer each install one, and on a machine with an `F`-suffix CPU and a single graphics card the panel showed two GPUs. Verified: PDH reported `d09f` and `103fb`, DXGI reported `d09f` plus two others, and only `d09f` was the RTX 4060 — so the filter is what removed the phantom.
Note:
The LUID is spelled in lowercase hex by the counters (`luid_0x00000000_0x0000d09f`) and `{:08X}` produced keys that never matched, which left every card unnamed through two rounds of "it still says GPU 1". Compare the strings case-insensitively or lowercase both. If nothing matches at all the code falls back to positional names rather than showing no GPU, so a machine whose counters and adapters disagree still gets something.

## 2026-10-01 - The panel's arrows scroll it, from the palette's key handler
Decision:
`ScrollArea` takes a bindable `viewport`, the store holds it, and `SearchBar`'s key handler moves it for `sysmon` — arrows by 48px, Page Up/Down by a screen, Home/End to the ends. `Cargo.toml` gains `Win32_Graphics_Dxgi`.
Reason:
The panel could not be scrolled by keyboard at all. The obvious fix — an `onkeydown` on the panel — cannot work: the search field always has focus, so keys bubble from it and never pass through the panel. The palette's handler is the only thing that sees them, and it was consuming the arrows for a list this panel does not have.
Note:
CPU and memory now sit side by side, as do the GPUs, because two figures read together should not each take a full row. The per-core bars are inline pixel heights and the cells are fixed, so a core moving from 3% to 90% changes a bar and nothing else — a layout that reflowed on every sample is what made it shake.

## 2026-10-01 - The system panel leads with charts, and samples on two clocks
Decision:
Each figure is a large number over a one-minute sparkline of its own history, with a per-core equalizer under the CPU. The charts are hand-drawn SVG — no charting library. On the Rust side the CPU and memory are read every second, but the process list is rebuilt every third second, on its own clock.
Reason:
The first version was a column of rows with a bar under each, which read as a form rather than a reading: nothing said whether a number was climbing, and every figure carried the same weight. A number over its own recent shape answers both "how much" and "which way". No library, because 60 points per series is far below the point where one pays for itself — the guidance is SVG under 1000 points — and a charting package would be tens of kilobytes for three polylines. The two clocks are the performance work: walking every process and computing its CPU share costs far more than reading the CPU counters, and the list is sorted by memory, which moves slowly. Three seconds is also the interval `sysinfo` needs between two readings of a process for its figure to mean anything.
Note:
The equalizer is drawn in inline pixel heights, not percentages. A percentage height inside a flex row does not resolve, because the row's height comes from `align-items: stretch` and the browser does not treat that as a definite height — the bars drew at zero through two attempts, `items-end` then `h-full` plus absolute positioning, before inline pixels worked. Verified by pixel-scanning the screenshot rather than by eye, which is what caught it; the chart lines were checked the same way, with CPU at 33% and memory at 72% drawing at matching heights.

## 2026-10-01 - System stats come from sysinfo, and GPU usage from the drivers
Decision:
`sys` opens a live panel — CPU with a tick per core, memory and swap, every GPU, the OS and uptime, and the eight processes using the most memory. Figures come from `sysinfo`; GPU usage is read per platform in `src-tauri/src/sysmon.rs`, from Windows performance counters and from the `PerformanceStatistics` dictionary every macOS accelerator keeps in the I/O registry.
Reason:
`sysinfo` carries CPU, memory, system and processes on every platform, and it is the only crate worth using for that: `heim` has not been touched since 2020 and `systemstat` is thinner. GPU is the exception — no crate does it across platforms, and the ones that try are either vendor-locked (`nvml-wrapper` is NVIDIA only) or far too small to depend on. Both branches read a figure the driver already publishes rather than talking to the hardware, which is what makes them work for NVIDIA, AMD, Intel and Apple's own without a library per brand, and what makes the macOS side need no privileges.
Note:
Two things are load-bearing. The sampler is held in state rather than built per call, because CPU and GPU usage are both deltas between two readings and a fresh sampler answers zero — including the PDH query, which resets if it is reopened. And the panel polls once a second while it is open and stops with it: this app lives in the tray, and sampling around the clock would be trading battery for nothing. Measured on Windows: 12th Gen Intel Core i5-12400F, 12 cores at 2.5 GHz, 10.2 / 15.8 GB, two GPUs at 7% and 0%, and the busiest processes by memory. The macOS branch is written but unverified — there is no Mac here.

## 2026-10-01 - The Start Menu is re-read while the app runs
Decision:
`refresh_apps` runs `load_or_refresh` again and stores the result; `apps.refresh()` calls it when the palette opens, throttled to a minute.
Reason:
The fingerprint check — a file count and the newest modification time of the scan roots — was there from the start, so re-running the scan is a few directory reads when nothing has moved. What was missing was any reason to run it: `warm` answers once and short-circuits every later call, and the frontend hydrated once in its constructor. A launcher that is restarted often gets away with that; one that lives in the tray keeps offering shortcuts that have been deleted and misses everything installed since boot.
Note:
It sits beside `update.checkQuietly()` in the `palette-shown` handler, and for the same reason: the app's only regular moment is the one where an answer can be acted on, and both throttle themselves. Measured: with the app running, a shortcut copied into the Start Menu appeared in the search results once the interval had passed, with no restart.

## 2026-10-01 - Explorer gets its switch unquoted, and the folder button shows on hover
Decision:
`reveal` passes `/select,<path>` through `CommandExt::raw_arg` rather than `arg`. The folder button in `AppItem` fades in on `group-hover` as well as on `selected`, and sits in the layout at `opacity-0` rather than appearing.
Reason:
Every press opened Documents. `Command::arg` quotes any argument containing a space, and Explorer does not follow the usual quoting rules: given `"/select,C:\Program Files\…"` it opens Documents instead, silently. Measured against the alternatives, the unquoted form is the one that works and the quoted one is the only one that lands somewhere else — so the switch has to reach it exactly as written, which is what `raw_arg` is for. Separately, the button appeared only on the keyboard's row, and a mouse user hovering a row had no way to know it existed. The app is keyboard-first, not keyboard-only.
Note:
`opacity` rather than a conditional render, so the row's text does not shift sideways when the button fades in. Verified in the running app: hovering a row that is not the highlighted one shows its button, and pressing the highlighted row's button opens the folder the shortcut lives in rather than Documents.

## 2026-10-01 - An empty icon location means the target's icon, not none
Decision:
`shortcut_icon` reads both `IShellLink::GetIconLocation` and `IShellLink::GetPath`, and tries the icon location first, then the target, before the caller falls back to the shell.
Reason:
Rows still wore the shortcut arrow after the first fix. Those shortcuts store an empty icon location — `,0` — which means "use the target's icon", not "there is none", and the code read it as the latter and fell back to `SHGetFileInfo`, whose answer for a `.lnk` has the arrow baked in. Markra and VLC are the two that showed it: neither names an icon, and both have an executable behind them with a clean one.
Note:
The named location still wins when it exists, because it is the more specific answer — it is where a DLL and a resource ID live, which is how Task Manager names an icon inside `Taskmgr.exe` rather than the executable's own. Verified in the running app after clearing the icon cache: `maa` and `vlc` list clean icons with no arrows.

## 2026-10-01 - A selected app offers its folder
Decision:
`reveal_app` opens the folder with the file selected — `explorer /select,<path>` on Windows, `open -R` on macOS — and `AppItem` shows a folder button on the right of the highlighted row only. No shortcut.
Reason:
Finding where an installed app lives is an occasional errand, not a frequent action, so it does not belong in the footer with the keys people press all the time. Showing it only on the selected row keeps a column of buttons from competing with the icons down the left. `AppItem` had to become a `div` wrapping two buttons rather than one button, because a button cannot hold another one; that is the shape the clipboard rows already use.
Note:
Selecting the file is the point — opening the folder alone leaves the user to find it again, which is the part they asked for. The path follows `/select,` with no space, which is what the switch expects; a space makes Explorer open Documents instead, silently. The palette stays open, and a path that has gone is the one case worth a notice.

## 2026-10-01 - A shortcut's icon comes from where it says, not from the shell
Decision:
`windows_icon` asks `IShellLink::GetIconLocation` for a `.lnk` and extracts from that with `SHDefExtractIcon` before falling back to `SHGetFileInfo`. `Win32_System_Com` and `Win32_System_Environment` join the windows features; `expand_environment` resolves the `%windir%`-style paths these store.
Reason:
Every Start Menu row wore a shortcut arrow. `SHGetFileInfo` with `SHGFI_ICON` answers with what Explorer draws for a `.lnk`, and Explorer draws shortcuts with the arrow overlay baked in. There is no flag that removes it: `SHGFI_ADDOVERLAYS` asks for *more* overlays, and leaving it off only means "no extras". A launcher's whole list is shortcuts, so the badge was on every row and said nothing.
Note:
`SHDefExtractIcon` is the call that matters, not `ExtractIconEx`: the stored index is often negative — `imageres.dll,-27` is a resource ID, not an ordinal — and only the former reads those. A shortcut with no icon location is normal and falls back to the shell's answer, arrow and all. The COM apartment is initialised per call and only uninitialised when this code was the one that set it up, because `RPC_E_CHANGED_MODE` means someone else chose the other model. Measured in the running app after clearing the icon cache: `git` and `reg` list clean icons with no arrows.

## 2026-10-01 - The field claims a command only once it is taken
Decision:
`commandIconName` and `searchEngineId` in `SearchBar` both require `ui.view` to be neither `empty` nor `suggest`.
Reason:
The field drew the current command's glyph as soon as the text could be a prefix, so `tr` — no space, nothing chosen — already showed translate's icon while the panel below still offered it as a row to pick. `matchedCommand` is set that early by design, so it is the wrong question; `view` already distinguishes "offering" from "entered".
Note:
Verified in the running app: `tr` keeps the magnifier, `tr ` switches to translate's glyph.

## 2026-10-01 - The tray uses the mark, not the app icon
Decision:
`tray.rs` loads `icons/tray.png` — `design/brand/mark.png` cropped to its content and scaled to 32px — instead of `app.default_window_icon()`. `tauri` gains the `image-png` feature, because `Image::from_bytes` does not exist without it. The file is made by hand; `scripts/generate-icons.mjs` and the brand README both say so.
Reason:
The tray showed a small purple face floating in the bar while every icon beside it filled its box, and the obvious guess — that the icon was smaller — was wrong. Measured against its neighbours, all of them were exactly 16px tall, and every frame of `icon.ico` is 100% opaque to its edges. It was the tile: the app icon is the raccoon on a near-black one, and a black tile on a dark taskbar is invisible, so only the face inside it showed and the icon read as small. The mark has no tile, so it reads in either theme. It cannot be generated in `generate-icons.mjs` because cropping needs an image library Node does not have.
Note:
Verified in the running app: the tray's raccoon now carries the same visual weight as WeChat's icon beside it. macOS is unverified and probably wants a monochrome template image for the menu bar, which is a different asset from this one.

## 2026-10-01 - A footer puts the keyboard on the left and the mouse on the right
Decision:
The update line is `⬆ 有新版本 1.0.1` then the `Ctrl+U` chip, both on the left, with the 安装 button pushed right by `ml-auto`.
Reason:
Every other footer in the app puts what the keyboard can do on the left and what the mouse can do on the right; this one had the chip beside the button on the right, for no reason other than how it was first written. The glyph is there so the line reads as a notice rather than a stray sentence — and because the footer is the one place the app speaks up on its own, it should look like it belongs there.
Note:
Verified in the running app.

## 2026-10-01 - Updates are checked on the palette opening, throttled, and offered in the footer
Decision:
`update.checkQuietly()` runs when the palette is shown and returns early unless `CHECK_INTERVAL` (six hours) has passed since the last attempt. A release it finds puts a line in `PanelFooter` — the version, a `Ctrl+U` chip, and a button for the mouse — which replaces the panel's own shortcuts while it is there. Installing from there is a plain press; the settings row keeps its confirmation dialog.
Reason:
The app lives in the tray, which is what makes the schedule the interesting part. "Check on startup" would mean once a week for someone who never quits it, and a timer would mean waking an idle machine to ask a question nobody is waiting for. Driving it from the palette opening means the check happens exactly when the user is present to act on it, and nothing runs while the app sits idle. The footer replaces rather than shares the row: an update is the one thing there that cannot be done later, and two sets of chips in a 32px bar would leave room for neither. The confirmation is dropped for the footer because reaching for the shortcut or the button is already the answer, while the settings row is a question ("is there anything new?") rather than an instruction.
Note:
The check is stamped before the request, so a slow or failing one cannot make every subsequent open try again. A found update is held rather than closed, because `check()` hands back a resource that installing needs. Verified in the running app with a version staged in the store: the footer reads 有新版本 1.0.1 with the chip and the button.

## 2026-10-01 - The search field draws the current command's glyph
Decision:
`FieldMark` shows the engine's mark for a web-search command, the command's own glyph otherwise, and the magnifier when neither applies. `components/icons.ts` holds the one icon table, used by `CommandItem`, `SettingItem` and the field.
Reason:
The field said nothing about where a keystroke was going: typing `settings` left the same magnifier as an empty field, and only the panel that opened said otherwise. Commands and settings rows each carried their own copy of the icon table and the field needed a third; three tables for one vocabulary is three places for a name to be missing, and a missing name silently becomes the fallback magnifier, which looks deliberate.
Note:
The engine mark wins over the command's glyph because it says more: `gg` is not "a web search", it is Google. Verified in the running app: `settings ` draws the gear, `cal ` the calendar, `gg ` Google's mark.

## 2026-10-01 - The overlays blur what is behind them
Decision:
All three overlay backdrops — `ActionConfirm`, `ClipConfirm`, `ClipPreview` — carry `backdrop-blur-md` on the same element as the tint.
Reason:
The blur was left off deliberately at first, and the reason no longer holds: inside the clipped content column a `backdrop-filter` is clipped to its own radius but not to the ancestor's `overflow-hidden`, so it reached further into the corner than the tint under it and smeared the pale shell into a white sliver. The overlays are siblings of that column now — the sliver is what moved them out — so the only rounded clip on the path is the backdrop's own, and the tint and the blur sit on one element with one radius. A preview of a paragraph is the case that made it matter: text behind it competed with the text inside it.
Note:
The corner could not be re-measured on the run that added this, because the palette hides on blur and the machine had another window in the foreground. The argument is structural rather than measured: the sliver came from two layers being clipped differently, and there is one layer now.

## 2026-10-01 - Caps Lock gets a badge; the input method's mode does not
Decision:
The search field shows `开启大写` while Caps Lock is on. Reading and setting an input method's 中/英 mode was implemented, measured, and removed — `src-tauri/src/keyboard.rs` is all that is left, and it only asks about Caps Lock.
Reason:
A launcher wants Latin text, and a Chinese IME left in native mode turns the first keystroke into pinyin. There is no supported way to ask for that from outside the input method, and the measurement is what settled it: after the palette called `ImmSetConversionStatus(IME_CMODE_ALPHANUMERIC)`, typing `nihao` in Notepad still opened the WeChat IME's candidate window. A GitHub code search for `ImmSetConversionStatus` returns 24 hits and every one is a header, a Wine compatibility stub or an SDK sysroot — no application calls it. The TSF alternative, `GUID_COMPARTMENT_KEYBOARD_INPUTMODE_CONVERSION`, is read and written only by input methods themselves (rime/weasel, google/mozc, corvusskk); nothing outside one drives it. The mode is the input method's own state with no public API, deliberately: an application that could flip a user's 中/英 would be a menace.
Note:
Reading is no better than writing — the badge said 英文 while the IME was in Chinese, because a TSF input method does not answer the IMM32 query either. So the whole feature is gone rather than half-kept. Caps Lock survives because the page reads that itself with `getModifierState`, and the Rust command is only for the moment before the first keystroke; verified in the running app, where `开启大写` appears with Caps Lock on.

## 2026-10-01 - Tab previews every clipboard kind, and WebView2's autofill is off
Decision:
`ui.preview` replaces `ui.imagePreviewSrc` and carries one of three shapes — image, text, colour — rendered by `ClipPreview`. A long body opens in a focusable scrollable card, so the arrow keys page through it; a colour opens a swatch with all five notations; a copied file list opens its paths. WebView2's general autofill and password autosave are switched off in `src-tauri/src/autofill.rs`.
Reason:
The footer advertised "Tab previews" while Tab did nothing for anything but an image, which is a promise the panel could not keep. The autofill dropdown is the reason it looked like a dead key on some entries: Tab is the palette's own key, and WebView2 opened its suggestion list instead. That is not a DOM event — a `keydown` handler cannot claim it, in the bubble phase or the capture phase, because the webview has already acted by then. It is switched off where it lives, the way `permissions.rs` answers the browser's dialogs.
Note:
Claiming Tab in the capture phase was tried first and reverted: `SearchBar` handles Escape on the input, so a capture-phase handler ran it twice and one Esc walked two steps back and hid the palette. With autofill off at the source, bubbling is enough. Verified in the running app: `clip` on a text entry opens a card, and on a colour entry a swatch with HEX/RGB/HSL/RGBA/HSLA; the startup log prints `rikki: webview autofill off`.

## 2026-10-01 - The colour panel's rows are one list for the keyboard
Decision:
`color/selection.ts` owns the order the arrows walk — the formats of the colour being typed, then the recent strip — and `ColorPanel` renders from it while `SearchBar` moves through it. Enter runs whichever row is highlighted; the footer says 复制 rather than 复制 HEX. The strip's `mt-4` applies only when something sits above it.
Reason:
The panel had no keyboard navigation at all: the arrows did nothing, so the recent colours were reachable only by mouse, and Enter always copied HEX no matter what was highlighted. Two copies of "the formats come first" would drift and put the highlight on the wrong row, which is why the order is one module rather than two loops. The gap was left over from when the strip always sat under an empty state or a swatch; alone it was 16px of nothing between the search field and the heading.
Note:
`optionCount` in `SearchBar` counts the same list, so `aria-expanded` is right for this panel too. Verified in the running app: two ArrowDowns highlight HSL and Enter copies it.

## 2026-10-01 - The colour panel's empty state and its recents are alternatives
Decision:
`ColorPanel` shows one or the other. With no recent colours the empty state takes the whole column (`class="flex-1"`, the way every other panel's does); with recent colours the strip is shown under its 最近颜色 heading and the empty-state line is gone. `color.recentEmpty` is deleted. The anniversary date hint is one short line about a leading year, because the syntax it used to teach is now two controls.
Reason:
The panel showed both at once — an empty-state line about typing a colour, another about clipboard colours appearing here, and a heading above them. With nothing remembered that is a heading introducing an absence plus two lines saying the same thing; with something remembered it is a hint about typing above the colours themselves. The `flex-1` was impossible before because the strip shared the scroll column, which is exactly the coupling that made both appear.
Note:
The date hint still spelled out `n1001` and `nr1001` after the form grew a 转为农历 button and a leap-month checkbox, so it was teaching syntax for two things the user can now press. What remains is the part no control covers: a leading year records when the anniversary started. Verified in the running app: `color` alone is a centred empty state with no heading, and after copying `#ff6363` the same panel shows 最近颜色 and the swatch with no empty-state line.

## 2026-10-01 - The leap month is a checkbox, asked only for the month it applies to
Decision:
The anniversary form offers a 闰{month}月 checkbox, and only when the typed month is the one that lunar year repeats. It flips the flag by rewriting the field through `draftTextFor`. `Ctrl+R` does the same and appears in the footer only while it would do something. `anniversary.leapNote` and `anniversary.leapDetected` are gone.
Reason:
The old note announced a year's leap month whenever the year had one and told the user to add an `r` themselves. It named the wrong month — entering 十月初三 in a year that repeats 六月 has nothing to do with 六月 — and it answered a yes/no question by teaching a notation, which is the part users cannot do: they do not know the syntax, and the field is the one place they should not need to. The question only exists for the single month that has two of them, so that is the only place it is asked now.
Note:
`draftTextFor` is the function that already renders a saved anniversary back into the field, so routing the toggle through it means the round trip is normalised and tested rather than string-spliced: `农1003`, `10-03` and `n20250615` all come out as `n…` / `nr…`. Verified in the running app: `n20250615` shows an unticked 闰6月 and a Ctrl+R chip, pressing it gives `nr20250615` and 闰六月十五, and `n20251003` in the same year shows neither.

## 2026-10-01 - The footer is one height, and a row leads with the calendar its date is kept in
Decision:
`PanelFooter` is `min-h-8` with no vertical padding, so the bar is 32px whether it holds key chips, translate's target picker or a form's save button. And `occurrenceMeta` puts the saved calendar first: a lunar anniversary reads 十月初三 · 11月11日, a solar one 07月10日 · 六月初七.
Reason:
Padding-based height made the bar as tall as its tallest child, and a save button is twice the height of a key chip — so the footer of a form was half again as tall as the footer of the panel that opened it, the same chrome at two sizes one keystroke apart. `min-h` rather than `h` so a caller with something taller in the `children` slot is not clipped. For the row, the solar date of a lunar anniversary moves every year: a date typed as 11月22日 read as "11月11日 · 十月初三" and looked like a mistyped save, when the eleventh is simply where 十月初三 falls this year.
Note:
Verified from the build rather than the running app: the stylesheet carries `.min-h-8{min-height:calc(var(--spacing) * 8)}` and `--spacing:.25rem`. The running check was abandoned because the palette hides the moment it loses focus, a process that is not already in the foreground cannot take it back with `SetForegroundWindow`, and Alt+Space is the window menu whenever some other window has it — so driving the UI while another app is in use is not reliable. The ordering has unit tests instead, which need `ensureLunar()` first or the lunar label falls back to numbers.

## 2026-10-01 - The anniversary form converts a solar date to lunar, and stops claiming to repeat
Decision:
`toLunarText` in `dates.ts` turns a solar date into the `n…` / `nr…` text the date field already accepts, offered as a 转为农历 button beside the field and as `Ctrl+L`. The `· repeats every year` half of `anniversary.previewSolar` / `previewLunar` is gone; those labels now read 公历日期 / 农历日期.
Reason:
A lunar anniversary is what people actually keep — a birthday, a 忌日 — but nobody knows the lunar date offhand, and the field demanded it in a notation the user had to derive themselves. Converting is a one-press fix. The "repeats every year" line was answering a question nobody asked: every anniversary in this app repeats, there is no toggle and never was, and printing it beside a form made it read as a setting that could be changed. It is the definition of the feature, not an option in it.
Note:
The conversion carries a typed year into the result, because a lunar date without one means nothing: the calendar drifts about eleven days a year, so a given solar month and day land on a different lunar date every year. Typed without a year it converts through the current one and drops the year again. The leap marker survives the trip (`nr…`), which a test pins by converting a day inside 2025's leap month 6 and back. Verified in the running app: `20261001` → `n20260821` (八月廿一), and the button disappears afterwards, because a lunar date has nothing left to convert to.

## 2026-10-01 - Every form screen wears the shared footer
Decision:
`AnniversaryCreate`, `EngineCreate` and `SnippetCreate` use `PanelFooter` instead of the hand-rolled row each of them carried. The form is the content column and the footer is its sibling, and the save button rides in the footer's `children` slot.
Reason:
Three screens had copied the same `mt-auto flex items-center justify-between px-1` row, and none of them drew the hairline the shared footer draws, so a form looked like a different kind of surface from the panel that opened it — including the anniversary list and its preview, one keystroke away, which do use it. The shared footer also brings the padding and message alignment that each copy re-derived by hand.
Note:
The button moved from `type="submit"` to `type="button"` with an explicit `onclick`, because it now sits outside the `<form>`. The form keeps its `onsubmit`, so Enter in a field still saves.

## 2026-10-01 - The theme preference and the painted theme are two things, and the default is `system`
Decision:
`ThemePref` (`system` / `dark` / `light`) is what the user picked and what `settings.json` stores; `ThemeId` (`dark` / `light`) is what is painted. `src/lib/commands/settings/theme.ts` owns the one function that turns the first into the second, and `+layout.svelte` is the only place that writes `data-theme`. The settings store keeps the OS answer live through a `matchMedia` listener, so a switch made while the palette is hidden is already in effect on the next show. The default, for a new install and for an unrecognised stored value, is `system`.
Reason:
The app shipped two themes and a stored choice, so a user who had never opened settings was pinned to whichever one the default happened to be, and changing the OS did nothing. `system` is the answer that needs no decision, which is why it is also what an unreadable value falls back to rather than an error. Splitting the preference from the painted theme is what keeps every other caller from having to ask what `system` means today.
Note:
`docs/memory/preferences.md`-style prior art aside, this is the first setting whose *value* is not directly paintable. Measured in the running app: with the machine in dark mode, a `theme` of `system` paints dark and the row reads 跟随系统（暗色）; the same build with `theme: light` paints light. The light theme is a peer, not a fallback — DESIGN.md says so.

## 2026-10-01 - The app updates itself from GitHub Releases, and one workflow builds both packages
Decision:
`tauri-plugin-updater` plus `tauri-plugin-process`, an endpoint of `https://github.com/aeroray/Rikki/releases/latest/download/latest.json`, and a minisign public key in `tauri.conf.json`. A `检查更新` row in settings checks, confirms through the app's existing destructive dialog, downloads with a per-percent notice, and restarts. `.github/workflows/release.yml` builds exactly two targets on a `v*` tag: the NSIS installer on `windows-latest` and the DMG on `macos-14` (Apple silicon), both as a **draft** release.
Reason:
The updater's signature is not optional the way code signing is: every installed copy verifies the download against the public key compiled into it, so losing the private key means no further update can ever be published for that app. That is why the key is generated once, kept outside the repository, and handed to the user to paste into GitHub Secrets. The draft release is deliberate — a tag is not the same decision as "this is public", and the updater only sees a published release. Nothing checks on its own: a launcher that interrupts a keystroke with an update card is the behaviour this app exists to avoid.
Note:
The NSIS installer is `perMachine`, not the CLI default, so the install path is `C:\Program Files\Rikki` and does not depend on the user's account name — the requirement was an English path and an English product name even though the installer itself is multilingual (`SimpChinese` + `English`, with the language picker shown). Measured: `makensis` produced `Rikki_0.1.0_x64-setup.exe`, and the generated script carries both `MUI_LANGUAGE` lines and `RequestExecutionLevel admin`. Neither package is code signed, so Windows shows SmartScreen's unknown publisher and macOS needs `xattr -cr /Applications/Rikki.app`. Unverified: the macOS job, which has never run, and an actual update round-trip, which needs a published release to check against.

## 2026-10-01 - The tray icon was never stale; the binary was
Decision:
No change. The tray uses `app.default_window_icon()`, which `tauri-codegen` resolves on Windows to `icons/icon.ico` and elsewhere to `icons/icon.png`, and the icons were already regenerated.
Reason:
The report was that the tray still showed the old mark. It does not: `default_window_icon` is compiled into the executable at build time, so a running process keeps the icon it started with, and Windows caches notification-area icons on top of that. Rebuilding and restarting is the whole fix — which is worth writing down, because "the asset changed but the app did not" is indistinguishable from a broken asset until you know where the bytes come from.
Note:
Measured: after a rebuild, the notification area shows the black tile with the lavender raccoon. The one thing genuinely worth changing later is macOS, where a black tile is the wrong shape for a menu bar that wants a monochrome template image; `mark.png` is the asset that would be used, and it cannot be verified without a Mac.

## 2026-10-01 - A footer status sits at the far right, and the clip list has one heading, not two
Decision:
`PanelFooter`'s message is pushed to the end of the row with an auto margin (`ml-auto` beside shortcuts, `mx-auto` alone) instead of taking `flex-1`. The clip panel drops its `最近 N` heading — the pinned block keeps `已固定 N` — and the footer count becomes `共 {count} 条` / `{count} items`. `clip.recent` is deleted from both catalogs.
Reason:
The component's own documentation said "shortcut chips on the left, optional status on the right" and "beside shortcuts it right-aligns", but `flex-1` alone left the status jammed against the last chip, where a count read as one more shortcut. The clip list had the mirror-image problem: "最近 35" was a heading for everything that was not pinned, which is the whole list, so it labelled nothing — while the count that answers "how much is in here" was squeezed into the shortcut row and said only "35 条". The user asked for all three.
Note:
An auto margin rather than `text-right`, because right-aligned text that overflows is clipped from its *start* — a long status would lose its first word instead of its last. The message also gained `tabular-nums`, so a count that changes does not shift the chips beside it. Measured in the running app: the clip footer reads `共 37 条` at the right edge with the chips untouched on the left, and the list opens straight into its rows.

## 2026-10-01 - A confirm that cannot be undone wears the danger colour, and a dialog button is 32px
Decision:
`--color-danger` (`#ff6369` dark, `#c2262b` light) joins the tokens, and DESIGN.md gains the rule that it appears on the confirm button of a dialog that cannot be undone — plus a warning glyph beside that dialog's title — and nowhere else. Both confirm dialogs (`ActionConfirm`, `ClipConfirm`) are drawn as destructive unconditionally, because every caller of `requestConfirm` is irreversible: the three system actions, deleting a custom engine, and importing a configuration over the current one. Their buttons drop from 40px to 32px, and DESIGN.md now says so: 40px is the icon-only hit target, not a button height. `KeyChip` gained a `tone` so the key hint inside a danger button takes `surface-1` for its cap instead of `surface-2`, and `ClipConfirm` shows its own shortcuts as chips like `ActionConfirm` already did. The dialog card also picks up the one real elevation shadow in the app (`--dialog-shadow`).
Reason:
The user's report was that the reboot confirmation did not look dangerous and its buttons were too big. Both were true and both were structural. The app had no destructive colour at all — the confirm button was `bg-surface-2` with a hairline, the exact dress of a neutral secondary button anywhere else in the app, for an action that restarts the machine. And 40px is the list-row height, so the two buttons were row-sized slabs and the heaviest thing in a 320px card whose body text is 13px. Danger is a semantic colour, not a second accent: lavender stays the only accent, and the "do not" list now forbids danger anywhere but that one button.
Note:
The chip's cap had to move off `bg-danger/15`: a second tint over the button's own left the 10px key name at 3.7:1, under AA, where `surface-1` gives it 5.8:1 in light and 6.5:1 in dark. The light token is `#c2262b` rather than Radix's red-11 `#ce2c31` for the same reason — on the button's own tinted fill the label needed 4.6:1 and `#ce2c31` reached 4.1:1. Measured in the running app in both themes: the glyph, the tinted confirm button and the quiet cancel in light and dark, and the 2px lavender focus ring on the button Tab reaches. The colour and the glyph are never the only signal — the title and the body already say what will happen. Considered and left alone: the save buttons in `SnippetCreate`, `EngineCreate` and `AnniversaryCreate` are also 40px, but they carry no fill, so their 40px is an invisible hit area rather than a visible slab, and shrinking them would only cost the hit target. The app still has no `:focus-visible` styling outside the dialogs, where the browser default ring was visible but foreign to the palette.

## 2026-10-01 - A clip row is named by what its body is, and wears one icon per kind
Decision:
`src/lib/commands/clip/content.ts` classifies a body as `image`, `files`, `color`, `url`, `email`, `path`, `multiline` or `text`, and `ClipItem` draws one glyph per kind: `Link`, `Mail`, `File`, `Files`, `Type`, `FileText`. The two kinds that carry their own picture draw no glyph at all — an image shows its thumbnail and a colour shows its swatch, which is why the `SwatchBook` beside the swatch is gone. The kind also feeds the meta line: a block gets its line count (`3 行`), a file list gets its count (`2 个文件`).
Reason:
Every row that was not an image wore the same `Clipboard` glyph, so the list could not be scanned for the one thing a person is usually looking for — the link, the address, the path. The classifier is also the honest place for the two kinds the old code detected inline and inconsistently: `ClipItem` parsed every text body as a colour on every mount, including half-megabyte logs, and `isUrl` existed only to print a label.
Note:
Two bounds are load-bearing, because this runs per entry per keystroke from `matchesClipQuery`: the classifier inspects at most 2048 characters (so `trim()`, which copies, never sees a large body) and the line count stops at 99. Path detection is deliberately strict — `/help` and `// a comment` are text, and a Unix path containing a space reads as text rather than the other way round. `matchesClipQuery` scores a kind's keywords separately from the body rather than concatenating them, which would copy the body on every keystroke; keywords exist only for the kinds whose body cannot be searched for them (an image's hashed file name, a file list's paths, and the words for a link, an address and a path), because a keyword on every text row would make almost any query answer "contains" and the ranking would stop meaning anything.

## 2026-10-01 - A copied file list is a clip, not a wall of paths
Decision:
`ClipboardEntry.type` gains `files`. The store reads the paths with the clipboard plugin's `readFiles`, joins them with a newline into `content`, keeps the total size in `size`, and pastes them back with `writeFiles`. The row shows the first file's name, the count and the size. Files are checked *before* text in `handleChange`, and they expire and prune with text rather than with images.
Reason:
Copying a file in Explorer is one of the two things a clipboard is for, and the history recorded nothing at all: `handleChange` returned early on `hasFiles()`. Explorer also puts the paths on the clipboard as text, so the early return was doing real work — without it, one copied folder would land as a wall of paths and pasting it back would paste the text rather than the files.
Note:
The paths share the `content` field with text so the history stays one list of one shape, at the cost of a path containing a newline (which cannot be pasted back correctly anyway). The text size cap applies to the joined list, so a folder of a few thousand files still fits. Pasting a file entry back was not exercised in the running app — it sends Ctrl+V to whatever the foreground window is, and an Explorer window would have copied the files somewhere — so `writeFiles` is wired by inspection and the plugin's contract, not by measurement.

## 2026-10-01 - A clip body is stored exactly as it was copied, up to half a million characters
Decision:
`capture()` and `handleChange()` no longer trim a copied body: only the emptiness check is trimmed, and `isColor` is computed from the trimmed form. A single body over `MAX_TEXT_CHARS` (512k characters) is not recorded at all, text and file lists alike.
Reason:
The trim was the write side's bug left standing on the read side. `writeClipboardText` already refuses to trim on the way out, with a comment saying why — "writing the trimmed value silently ate the leading indentation and trailing newline of multi-line snippets" — and the capture path then ate exactly that before the value was ever stored, so a copied block pasted back without its indentation. The cap is the other half: text has no *count* cap by decision, but the whole index is rewritten on every clipboard change, so one "select all" in a large file would make every later copy rewrite a multi-megabyte `index.json`.
Note:
Measured in the running app: a copied `"    indented line\n    second line\n"` is stored with its indentation and its trailing newline, and a 600,000-character copy leaves the index at the same entry count as before it. Dedupe still compares the stored body exactly, so a copy with and without a trailing newline are two rows — faithful rather than tidy, which is the point. HTML and RTF are deliberately *not* captured with the text: the plugin can read both, but the index is rewritten whole on every change, so a page's HTML would have to live in its own file the way images do, which is a larger change than this one. `ClipItem`'s preview collapses the first 400 characters rather than the whole body for the same reason the cap exists.

## 2026-10-01 - WebView2's permission dialogs are answered in Rust, before the page can see them
Decision:
`src-tauri/src/permissions.rs` attaches a `PermissionRequested` handler to the palette webview from `setup` and answers every request itself: `DENY` for every kind, `ALLOW` for autoplay alone. Nothing is left to the default, so the dialog is never created. Each answer is logged with the kind and the verdict, and a startup line records that the handler attached.
Reason:
The dialog the user kept meeting (`http://localhost:1420 想要 查看复制到剪贴板的文本和图像`) is WebView2's default answer to `PermissionRequested`, and that default is a system modal: it takes the keyboard, cannot be answered without leaving the palette, and — because the palette hides on blur — can outlive the window it belongs to. Answering on the Rust side is the only place that covers every path at once, including paths not written yet. Autoplay is the single exception: it is a playback policy rather than a capability the app lacks, the only media in the app is the pronunciation clip fetched in Rust, and denying it would leave a button that does nothing. `SetState` is what suppresses the default UI — the same call `wry` makes for its opt-in `with_clipboard(true)`, which Tauri leaves off, and that is why the prompt was reachable at all. It needs no capability: app commands are outside `capabilities/default.json`.
Note:
Measured in the running app (WebView2 154 / Chrome 154). With the profile's persisted `clipboard` grant removed from `EBWebView/Default/Preferences` — the user had answered the dialog once, and a persisted `ALLOW` is why the prompt stopped appearing and why a re-test looked clean — `navigator.clipboard.read()` from the palette logged "clipboard-read permission requested; denied without a dialog" and rejected with `NotAllowedError`; the same call under the default handler had shown the dialog. Ctrl+V into the search field still pastes, so denying `ClipboardRead` does not reach the browser's own paste command. macOS is unverified: the module is Windows-only, and `navigator.clipboard` there has no equivalent dialog to suppress. This is the structural half of the `navigator.clipboard` tombstone.

## 2026-10-01 - The modal backdrops are flat tints, and the modals sit outside the clipped column
Decision:
`ImagePreview`, `ClipConfirm` and `ActionConfirm` are siblings of the palette's `overflow-hidden rounded-[inherit]` column rather than children of it, and their backdrop is `bg-black/55` alone — `backdrop-blur-xl` is gone from all three. `rounded-[inherit]` stays on the backdrop so the tint follows the window's shape.
Reason:
Both halves are one bug: a 1px arc of undimmed shell along each rounded corner, which reads as white leaking out of the window. Chromium clips a `backdrop-filter` layer to its own `border-radius` but not to a rounded ancestor's `overflow-hidden`, so inside the column the tint was clipped twice (column plus own radius) while the blur was clipped once, and the blur smeared the pale shell into the corner the tint failed to cover. Moving the modals out leaves the backdrop's own radius as the only rounded clip on the path; dropping the blur removes the layer that was brighter than the tint. The blur was never load-bearing — `bg-black/55` is what de-emphasises the panel behind a dialog.
Note:
Measured in the running app on the top-left corner pixel with the image preview open: the peak went from `A2` (162) against an interior of `6A` (106) — a visible white sliver — to `6A` (106) against `67` (104), so every corner pixel is now at or below the interior and the corner is an ordinary antialiased ramp. The gutter stays `151517` to the edge, so the four square patches the 2026-10-01 empty-state entry added the radius to prevent have not come back. That entry's "backdrop carries its own corners" half is superseded as an explanation: the patches came from the same ancestor-clip gap, and the radius alone was never what fixed them.

## 2026-10-01 - The dev server ignores temp-file writes, so an edit cannot kill it
Decision:
`vite.config.js` adds `**/*.tmp`, `**/*.tmpdir` and `**/*.tmpdir/**` to `server.watch.ignored`, beside the existing `**/src-tauri/**`.
Reason:
Editors and agents that save through a temporary file next to the target leave that temporary open for a moment, and on Windows chokidar's watch of it fails with `EBUSY`, which Vite treats as fatal. The dev server exits, `tauri dev` reports `beforeDevCommand` failed, and the app window keeps running on the page it had already loaded — so a frontend fix lands in the source and never reaches the app, which is one way the QR-decode half of the permission fix could have looked like it had not worked.
Note:
Measured: every edit made through a temp-directory writer killed `pnpm tauri dev` with `EBUSY: resource busy or locked, watch '…\+page.svelte.<pid>.<uuid>.tmpdir\+page.svelte.tmp'` until these patterns were added, and the window stayed alive on the old module each time. The patterns cannot match a source file, so HMR is unaffected.

## 2026-10-01 - The QR decode reads the clipboard in Rust, not in the webview
Decision:
`qrd` no longer calls `navigator.clipboard.read()`. The live clipboard image is read through the clipboard plugin instead: `ClipboardStore.readCurrentImage()` has the plugin write the clipboard bitmap into `clipboard/images/`, reads those bytes back with `read_clipboard_image`, and discards the file again with `discard_clipboard_image` unless an entry already references it. The history scan that runs first (the five newest image entries) is unchanged, and so is the reason the second read exists at all: the image copied a moment ago may not have been captured into the history yet.
Reason:
WebView2 answers `navigator.clipboard.read()` with a permission dialog ("http://localhost:1420 想要 查看复制到剪贴板的文本和图像") — a system modal in the middle of a keystroke-driven launcher, and one the user cannot answer without leaving the keyboard. Every other clipboard read in the app already goes through the plugin, which reads on the Rust side and asks for nothing: the clip history, the JSON panel's clipboard seed, `{{clipboard}}` in snippets. This path was the only one that did not. It needs no capability either — app commands are outside `capabilities/default.json`.
Note:
The plugin names the image file after a hash of its bytes, so a decode and a capture of the same image share one path — hence the reference check before the discard, and the wait on `pendingCapture` (a capture can be between writing the file and recording the entry that keeps it referenced). `src/lib/stores/clipboard.test.ts` covers the three outcomes: bytes without a history row, discard when unreferenced, keep when referenced. Not verified in the running app: that the prompt is gone, and macOS, where the plugin reads NSPasteboard and was not exercised.

## 2026-10-01 - The palette steps out of the way of every system dialog
Decision:
`alwaysOnTop` stays — a launcher has to overlay other apps — but it is dropped for as long as a system dialog is up, together with the blur-hide suppression that keeps the palette from vanishing when the dialog takes focus. The two are one object: `crate::begin_native_dialog` returns a guard that does both and restores both on drop, so a cancelled dialog leaves the palette visible, focused and topmost again with the screen the user was on still there. The dialogs are `export_settings` (save), `pick_import_file` (open) and `qr`'s `save_png_file`. Topmost is dropped *before* the dialog is created, and the change is confirmed by reading the flag back: `set_always_on_top` only posts a message to the main thread, and `HWND_NOTOPMOST` puts a window at the *front* of the non-topmost band, so a palette that stepped aside after the dialog appeared would land back on top of it.
Reason:
The system file dialog has no owner window — `tauri-plugin-dialog` leaves `parent` unset, so rfd hands a null owner to `IFileDialog::Show` — and nothing keeps a `WS_EX_TOPMOST` window from being painted over it, which is what covered the dialog's own buttons. The 2026-08-29 note that "a save dialog must ignore blur-hide so the palette stays up" is what left it on screen: staying up was never the problem, being topmost was.
Note:
Established by reading the tree, not by running the app: `alwaysOnTop` in `tauri.conf.json` is the only always-on-top in the repository, and no `set_always_on_top` call existed. Supersedes the blur-hide half of the 2026-08-29 QR entry. Unverified: the z-order itself, and macOS, where rfd shows a modal panel rather than an owned window.

## 2026-10-01 - Export and import are two settings rows, and there is no backup folder
Decision:
The backup screen is gone: no list of past backups, no `app_data_dir/backups/`, no snapshot taken before an import, no typed-path sub-screen. `settings` has two rows that act rather than open a screen — 导出配置 opens the system save dialog and writes todos, snippets and settings wherever the user points; 导入配置 opens the system open dialog, reads the file it returns, and only then asks through `ActionConfirm` before replacing anything. The whole-file validation and the three-file `write_all_or_nothing` commit stay. Export asks nothing, because the save dialog already is the decision and it cannot destroy anything — the app's rule is that confirmation is for what cannot be undone.
Reason:
The user asked for the two things every app has: put the current configuration where they can copy it from (a desktop, a sync folder) and read it back on another machine. A folder of the app's own, a history and a snapshot are a second copy they did not ask for, and one they cannot see from the machine they are importing on. Two rows rather than a screen because there is nothing left for the two actions to share: the screen would hold two rows and nothing else, for one extra keystroke in each direction.
Note:
The file format is unchanged, so files the backup screen wrote still import. `list_backups`, `create_backup`, `inspect_backup`, `save_backup_copy`, `pick_backup_file`, `open_backups_dir`, `unique_path` and the `BackupFile` shape are deleted rather than kept "in case". The file is read as it is picked, so a file that is not ours is refused while the data on screen is still untouched. Not verified in the running app: the two dialogs and the confirmation.

## 2026-10-01 - Backups are one screen in the palette, not two native dialogs
Decision:
Export and import are one settings row (备份与恢复) opening one screen, `settings backup`. That screen is a single list: `新建备份`, whose value is the live counts of what it would write; then the files in `app_data_dir/backups/`, newest first, each labelled with its local `YYYY-MM-DD HH:MM:SS` and its counts, with a file that will not parse listed as 无法读取 rather than dropped; then `从文件导入…`, `另存为…` and `打开备份文件夹`. Enter on a file arms the existing `ActionConfirm` with a body naming the current data it would replace. `从文件导入…` opens a path field that describes the file it resolves to as it is typed (250ms debounce) and offers the native picker beside it; `另存为…` keeps the native save dialog. Before anything is replaced, the current data is written into the backup folder as a snapshot, and todos, snippets and settings are then committed through `json_file::write_all_or_nothing` — every temp written first, then the renames. A file that is missing a section is refused whole, and `settings.import.partial` is gone.
Reason:
The folder is the app's own, so export and import are two views of one thing and belonged in one list with one vocabulary, not on two settings rows that each opened a system modal in front of a 600×400 palette. A native dialog is not foreign to this app — the QR panel saves a PNG through one — but it is the wrong default for a recurring operation whose result the app can list itself. Restoring is irreversible, so it goes through the one confirmation dialog the app already has, and the snapshot is what makes it reversible anyway: an import that fails between the three writes, or a shortcut the imported settings cannot register, leaves the previous state in the folder as a file the user can restore.
Note:
The file name carries the local clock and is built in the frontend, because Rust has no local time without another dependency and the name is what the user reads in Explorer or Finder. `list_backups` reads at most 20 files, at boot and after anything writes to the folder. Not verified in the running app: the panel's height with a full header, and the two native dialogs (they are the parts that need a real window).
Superseded by the entry above (2026-10-01, two settings rows): the screen, the folder, the list and the snapshot are gone and the two native dialogs are the only way in or out. The whole-file refusal is not part of what was reversed and stays.

## 2026-10-01 - One empty state for every panel, and the backdrop carries its own corners
Decision:
Every command panel's empty state is `components/PanelEmpty.svelte`: an `ink-tertiary` 16px-stroke icon over a centred 13px block, `title` and `hint` both kept where both exist. A panel whose empty state shares its column with a second section (calc's history, color's recent strip) passes no `flex-1`, so the state stays in the flow. The three modal backdrops (`ActionConfirm`, `ClipConfirm`, `ImagePreview`) put `rounded-[inherit]` on the overlay wrapper and on the `bg-black/55 backdrop-blur-xl` layer itself.
Reason:
A hint alone, centred in a tall empty column, reads as something that failed to load, and eleven panels each had their own version of that idea, so the size, colour and measure now exist once. The backdrop is a composited `backdrop-filter` layer: its rounded edge has to travel with the layer rather than depend on the shell's `overflow-hidden` two levels above it, which is where four square corners can leak into the transparent gutter.
Note:
Measured in the running app (WebView2 154 / Chrome 154), not reasoned about: each overlay's containing block is the inner `relative … overflow-hidden rounded-[inherit]` div (12px), not the outer `p-2` div, and the mask is already clipped correctly there. The layer's own radius is therefore a robustness fix in that engine, not a visible change — the corner pixels move by at most 13/765.

## 2026-09-30 - Icon caches are versioned, and only placeholders get a background
Decision:
ICON_FORMAT_VERSION is part of the icon filename (2-{hash}.png), and the icon
containers in AppItem and BrowserSelector add g-surface-1 only when there
is no real icon.
Reason:
The cache is keyed by the source path alone, so a change to the extractor leaves
every icon already on disk untouched and never re-extracted — the fix would have
looked like it did nothing. Bumping the version makes prune_icons drop the old
names and re-extract. Separately, --color-surface-1 is #ffffff in the light
theme, so painting it behind a real icon puts a white square behind anything whose
artwork is not a full-bleed rectangle: Chrome's round mark was the visible case,
and only in light mode. A placeholder needs a background; a real icon does not.
Note:
Two alpha defects were found in the Windows extractor at the same time, both
measured rather than reasoned about. DrawIconEx returns premultiplied alpha, so
writing it straight into a PNG darkened every antialiased edge by its own alpha;
and an icon with no alpha channel at all — the AND-mask case — came back fully
transparent, which the old "all bytes zero" guard did not catch, so an invisible
PNG was cached as a success and never retried. The guard now asks whether any
pixel is visible, and synthesises alpha from the mask when none is.
## 2026-09-30 - Browsers show their own icon; search engines show their brand
Decision:
The browser picker renders each browser's real icon — extracted by `apps_icons` into `app_data_dir/apps/icons/browsers/`, named by the hash of the executable path, extracted once and then cached — and falls back to the existing `Compass` tile when there is none. The search field's leading icon becomes the engine's mark for `gg`/`bd`/`bing`/`ddg`/`sogou` and for the fallback-search row, and stays the magnifier everywhere else, custom engines included. The marks come from `@iconify-icons/cib` (CoreUI Brands, CC0), one module per icon, drawn monochrome through `currentColor` in `components/EngineMark.svelte`.
Reason:
A browser's own icon is the only source that can label a browser no library has heard of (`Tabbit浏览器`), and it is the extraction installed apps already use — a logo library could only guess or give up. For the engines, Simple Icons — the obvious source, and what its Svelte wrappers are built from — has no Bing at all, so it cannot cover the five engines the settings offer; CoreUI Brands is the only set found with all five, and its per-icon modules mean five marks cost ~4KB rather than the whole 830-icon set.
Note:
`write_png` had been failing every extraction since the atomic-write change: it wrote through `dest.with_extension("png.tmp")` and let `image::save` read the format off that extension, so no app icon had been extracted since 2026-09-30. It now names `ImageFormat::Png`, guarded by a Windows test that writes one and reads it back. On macOS a browser's executable path is resolved up to its `.app` bundle before the `.icns` is looked for; that path is unverified.

## 2026-09-30 - Translate is keyless: Sogou for sentences, Youdao for words
Decision:
`tr` posts sentences to Sogou's Hunyuan endpoint (`text`/`from_lang`/`to_lang`, no key and no signature) and single words to Youdao's public dictionary, which returns US and UK phonetics with matching audio, part-of-speech definitions, word forms and bilingual examples. The dictionary sits behind `lookup_word`, so a word it does not know falls through to the translator. One setting, `translateTarget`, holds the target and `Tab` cycles it; the source is guessed from the script, and a target that would equal the source falls back to the interface language.
Reason:
Baidu required the user to register an app and paste an AppID and a secret before the command did anything at all, and its results were poor — a launcher should not open with a configuration task. Sogou's Hunyuan endpoint is the one its own translate page calls for free text and it returns a model translation rather than a phrase-table lookup, while Youdao's dictionary is public and returns exactly what a word card needs. Sogou rejects `auto` as the source, so guessing is the only way to send a request at all, and one remembered target means the common zh↔en case needs no trip to a settings screen.
Note:
The dictionary is Youdao's rather than Sogou's because Sogou's is signed rather than public. Pronunciation audio is fetched in Rust and returned base64 to play from a `data:` URL, so the webview still has no network access of its own and the CSP only gained `media-src 'self' data:`. The translate settings screen was deleted: there is nothing left to configure.

## 2026-09-30 - Commands answer to Chinese and pinyin, not just a Latin prefix
Decision:
`rankCommand` scores `pinyin-pro` against every Chinese name a command has, and the whole vocabulary (Chinese names, a few Latin additions) lives in one table, `src/lib/commands/aliases.ts`, merged in `register()`. `match()` and `fuzzyScore` normalise full-width forms and the ideographic space to ASCII first. A vitest suite guards the table: every command has an entry, no entry outlives its command, no two commands claim the same spelling, and every spelling resolves through `match()`.
Reason:
The prefix syntax assumes a keyboard with no IME in the way. With one active, the search box holds the *pinyin* while it composes — so a command that only answers to `cal` stays invisible until the characters are committed, which is a keystroke the user should not have to spend. Scoring pinyin means `wnl`, `rili` and `chongqi` all find their command before anything is committed, and `pinyin-pro` handles 多音字 (`chongqi` and `zhongqi` both reach 重启) better than any hand-written table would. The ideographic space is not cosmetic: an IME's space bar emits U+3000 and the syntax is `prefix + " "`, so `ann　1001` previously matched nothing at all.
Note:
`rili` has to reach the calendar even though its title is 万年历, which is why the Chinese aliases are load-bearing rather than a convenience — pinyin is derived from them, so an alternative name for the same thing needs its own entry. Measured cost of the pinyin pass: ~0.09ms for 34 names, so ~0.2ms per keystroke across every command.

## 2026-09-30 - Commands that cannot be undone ask first
Decision:
A `Command` may carry `confirm: true`. `activateCommand` then arms `ui.requestConfirm` instead of running it, and `ActionConfirm` carries it out on a second Enter (Esc or the backdrop cancels). `shutdown`, `reboot` and `logout` are marked; `lock` and `sleep` are not, since both are one keystroke to reverse. Deleting a custom search engine uses the same dialog with its own body text.
Reason:
A launcher is driven fast and from muscle memory, and the prefix alone is not much of a guard — the mistake costs whatever was open. This is the second layer: the first is that an action command only fires when its prefix was actually typed, because `reb` fuzzy-matches `reboot` as the only hit.
Note:
The key hint lives inside each button rather than in a row beside it: the same two words twice was redundant, and in English the two groups together were wider than the 320px card.

## 2026-09-30 - The window keeps a CSP, with `'unsafe-inline'` for scripts
Decision:
`app.security.csp` is set rather than `null`: `default-src 'self'`, `script-src 'self' 'unsafe-inline'`, `img-src 'self' asset: http://asset.localhost data: blob:`, `connect-src 'self' ipc: http://ipc.localhost`, and `object-src`/`base-uri`/`frame-ancestors`/`form-action` locked down.
Reason:
Both `{@html}` sites (the JSON highlighter, the QR SVG) were verified safe, so this is depth rather than a fix. `connect-src` is the part that does real work: it stops an injected script from shipping clipboard contents off the machine. The `'unsafe-inline'` is measured, not assumed — SvelteKit inlines its bootstrap script, Tauri only nonces `script[src^='http']`, and a build served with `script-src 'self'` renders a blank page. A nonce for that script would need a SvelteKit HTML transform plus a Tauri token, and would break `pnpm tauri dev`, where the HTML does not pass through Tauri's asset handler.
Note:
To re-check: build, inject the policy as a `<meta http-equiv>` tag, and load it — with `'unsafe-inline'` the app renders, without it the page is blank.

## 2026-09-30 - Two Windows APIs that are per-thread, not per-process
Decision:
Cursor repair and global-shortcut re-registration both run on the main thread, and the shortcut restore is deferred through a *different* thread before it gets there.
Reason:
`ShowCursor`'s display counter is per-thread: measured with the main thread at -2, a freshly spawned thread reads 0. A repair on a worker thread therefore reads its own untouched count and returns without calling `ShowCursor` at all — which is exactly what an earlier attempt at this fix did. Separately, `run_on_main_thread` runs its closure *inline* when the caller is already on the main thread, so it cannot be used to escape a callback that is itself on the main thread.
Note:
The shortcut plugin holds its own mutex for the whole duration of the callback it invokes, and `register`/`unregister` take that same mutex. `std::sync::Mutex` is not reentrant, so calling either from inside the handler deadlocks the app — hence the thread hop, not a `run_on_main_thread` call.

## 2026-09-30 - Panels end in a pinned footer, not a hint paragraph
Decision:
Every panel ends with `components/PanelFooter.svelte`: a chrome bar where each shortcut is a `kbd` chip beside its action, a hairline separates it from the content, and it is a flex sibling of the content column rather than its last child. The calendar adopted it first and the other fourteen panels followed in the same change; `.palette-hint` is gone from `app.css` and no panel uses it. Actions shared by several panels live in one `key.*` vocabulary (`key.back`, `key.copy`, `key.save`, `key.cancel`, `key.confirm`, `key.open`, `key.edit`, `key.add`, `key.delete`) instead of being reworded per panel, which is what keeps "返回" reading the same everywhere.
Reason:
The calendar's hint was the last child of the content column, so a 6-week month pushed it out of the 600×400 palette and made the panel jump between months. Six rows is the true maximum — 516 of the 2412 months from 1900 to 2100, never seven — so the day grid takes `grid-rows-6` with `min-h-0 flex-1`, and the cells fill their row instead of a fixed `h-8`. That keeps the grid height constant whatever the month contains and leaves the footer always visible. Key chips are untranslated glyphs; the old combined hint strings (`calendar.footer`, `json.copyHint`, `clip.footer`, …) were deleted as they were replaced, since the catalogs must not carry unused keys.
Note:
`PanelFooter` takes `shortcuts`, `message`, or both: `message` alone centres a note, and beside shortcuts it right-aligns. A panel computes both with `$derived.by` so one component covers hint, error and confirmation states. Sub-screens with their own chrome (`AnniversaryCreate`, `SnippetCreate`, `EngineCreate`) keep their own bottom rows and deliberately do not render the parent's footer.

## 2026-09-24 - The calendar stays on `lunar` v2 and ships no almanac data
Decision:
`cal` (aliases `calendar`, `date`, 日历, 万年历) opens a month grid with lunar day names, ganzhi and zodiac in the header, today ringed, weekends dimmed, and a one-line detail strip for the selected day. Arrows walk days, PgUp/PgDn change month, Shift+↑↓ change year, Home returns to today, Enter copies the date, and `cal 20261001` jumps. It reads the same `lunar` v2 tables as the anniversary command, loaded on demand.
Reason:
6tail's `lunar-typescript` is the only candidate that offers a real almanac (solar terms, 宜忌, 冲煞, 纳音, 星宿, 八字, 值神, 建除, 吉神凶煞, 时辰, holidays) — measured at 28 available fields against `lunar` v2's zero. It was still declined: it cannot be tree-shaken (importing only `Solar` ships 325KB minified / 100KB gzipped, against 8.9KB for the lazy `lunar` chunk), and the launcher's calendar does not need a 黄历. The user chose the light option knowingly. `lunar` v2 gained `yearGanZhi`, `yearZodiac`, `lunarYearDays` and `lunarMonthDays`, all derived from data it does expose and verified against known values (2026 丙午/马, 2025 乙巳/蛇, 1984 甲子/鼠; leap years 384 days vs 354 common).
Note:
If a future command genuinely needs solar terms or 宜忌, switching to 6tail is a contained change: everything lunar goes through `anniversary/lunar.ts`, so only that adapter and its import would move.

## 2026-09-24 - Lunar calendar uses `lunar` v2, not 6tail's lunar-typescript
Decision:
Lunar conversion goes through `src/lib/commands/anniversary/lunar.ts`, which wraps the `lunar` v2 package (MIT, full TS types, range 1890-2100) behind a small `LunarApi` surface. The library is imported on demand. Leap months are entered explicitly (`nr1001` = lunar leap Oct 1) rather than inferred; `leapMonthOf()` derives a year's leap month by probing, memoised.
Reason:
Measured, not assumed. `lunar-typescript` / `lunar-javascript` (6tail) are monolithic and cannot be tree-shaken: importing only `Solar` still shipped 325KB minified (~100KB gzipped). `lunar` v2 ships 12KB minified (~4KB gzipped), and the lazy chunk in the real build is 8.9KB. Both were verified equally accurate — every Spring Festival, Mid-Autumn and Dragon Boat date matched, and a full-range comparison of derived leap months against 6tail's official `getLeapMonth()` agreed on all 211 years (1890-2100) with 605 sampled conversions identical. `lunar` v2 was chosen over `solarlunar` too: wider range, richer data (ganzhi, zodiac, festivals) for future calendar commands, and explicit throws instead of `-1` sentinels.
Note:
v2 has no "which month is leap in year Y" query; the probe is the documented workaround and costs ~0.03ms. A leap flag cannot be derived from the year alone in general — a year repeating month 5 leaves "month 5" ambiguous — which is why the input carries it.

## 2026-09-24 - Anniversary dates are typed compactly in one field
Decision:
Dates are entered without separators: `1001` is Oct 1, `20261001` adds a start year, `n1001` marks lunar, `nr1001` marks a lunar leap month. The create form has exactly two inputs (name, date) — no month/day spinners, no calendar toggle, no leap checkbox, no separate start-year field. The date field echoes back what it resolved to.
Reason:
Fewer, larger inputs with immediate feedback beat a form of small widgets. The year inside the date IS the start year, so a second year input was redundant; and a leap-month checkbox is wrong because whether a month repeats is a property of the year, not a choice the user makes.

## 2026-09-24 - Storage writes go through one atomic JSON helper
Decision:
Every persisted file uses `src-tauri/src/storage/json_file.rs`: write a temp file, then `fs::rename` over the target with no `remove_file` first (`fs::rename` already replaces an existing destination on Windows and Unix). A file that fails to parse is renamed to `<name>.corrupt-<epoch>` and rebuilt — settings and usage fall back to defaults, the app cache to a fresh scan, the clip index to an empty list. `usage_count` increments take a process-wide mutex.
Reason:
Remove-then-rename left a window where the user's file did not exist at all. One unreadable byte in `settings.json` made every later `update_setting` fail, so settings could never be changed again, and `usage_count.json` used `unwrap_or_default()`, silently zeroing every launch count.

## 2026-08-30 - Palette chrome uses Raycast-like tokens
Decision:
Dark canvas is `#07080a`, panels `#111214`, hairlines `rgb(255 255 255 / 0.06)`. Rows select and hover with translucent fills, not a 2px accent border. Home-list fade-stagger runs only when the empty palette opens.
Reason:
Solid black, off-grid padding, and a hard selected outline read as cheap next to a command palette.

## 2026-08-30 - Home list ranks by command usage
Decision:
Empty-home commands sort by `usage_count.json` key `command:{id}` descending, then a default rank with clip and snippet first. Count once per visit when a prefix panel or web prefix + space becomes active; restoring the last query does not count. The empty home is only the command list; it has no instructional copy.
Reason:
Map insertion order looked alphabetical, and a fresh install should still surface the commands people open most.

## 2026-08-29 - Escape steps back to home before hiding
Decision:
Escape closes overlays and drills first, then clears the search and returns to the empty home. Escape on an empty home hides the palette. Blur and the palette hotkey still hide without clearing.
Reason:
Users need to leave color, clip, and other panels to open a different command without dismissing the launcher.

## 2026-08-29 - Palette restores last query after a casual hide
Decision:
Blur or hotkey hide keeps the last query and page. Launching, copying, or opening a web search resets on the next show. Escape from a panel clears the query instead of hiding with it.
Reason:
Leaving to copy a setting must not dump the user back to an empty palette.

## 2026-08-29 - Clip cleanup lives in settings
Decision:
Retention stays 7 / 30 / never. Cleaning expired unpinned text and extra images is a settings action with a confirm. Clearing unpinned clip history is Shift+Delete in the clip panel, also with a confirm.
Reason:
The clip panel is for browsing and pasting; bulk delete belongs with retention or a shortcut, not two footer buttons.

## 2026-08-29 - Backups overwrite todos, snippets, and settings
Decision:
Settings can export and import a versioned JSON file of todos, snippets, and settings. Import replaces those files in full. Clip history is not included.
Reason:
Those three are user-owned; clip is ephemeral, and merge or cloud sync would add UI the launcher does not need.
Note:
Still true of the 2026-10-01 export/import rows; only the vocabulary moved from "backup" to 导出配置 / 导入配置, because there is no backup folder for the word to point at.

## 2026-08-29 - Clip texts stay; images cap at 200 and 5MB
Decision:
Clipboard text has no count cap. Images keep at most 200 files; a copy over 5MB is skipped and not stored. Oldest images (unpinned first) are dropped with their files.
Reason:
Text is small enough to keep; image files are the storage risk, and 5MB covers screenshots and normal photos.

## 2026-08-29 - No list virtualization; lazy-load heavy packs
Decision:
Do not window emoji or clip lists. Emoji search still caps at 96. `@emoji-mart/data` and mathjs load on first use; command panels stay static imports.
Reason:
Estimated-height windowing left empty space when scrolling; a 400px palette already scrolled smoothly with the full DOM.

## 2026-08-29 - Copy uses the clipboard plugin and flashes on failure
Decision:
Text copies go through `tauri-plugin-clipboard-x` with capture suppressed. Failures flash in the palette instead of hiding.
Reason:
Navigator clipboard was silent on failure and polluted clip history with converter output.

## 2026-08-29 - QR generate copies SVG; decode reads clip images
Decision:
`qr`/`qrcode` builds an SVG in the search bar (Enter copies SVG, Tab saves PNG). `qrd`/`qrdecode` runs jsQR on clipboard images. Black/white, error level H. No camera, logo, or color options.
Reason:
Screenshots already land in clip history, so decode does not need a camera. (The other half of this reason — "a save dialog must ignore blur-hide so the palette stays up" — is superseded: see the 2026-10-01 entry on system dialogs. Staying up over the dialog is exactly what hid the dialog's own buttons.)

## 2026-08-29 - Timestamp converts in the search bar
Decision:
`ts`/`timestamp` parses 10-digit seconds, 13-digit millis, `YYYY-MM-DD` (also `/` and optional time), and 今天/today/now. Unix input copies local time; date input copies seconds. Local and UTC only; no history.
Reason:
Developers convert timestamps constantly; the search field is enough, and extra timezone or date-math UI is out of scope.

## 2026-08-29 - JSON and Base64 are prefix convert panels
Decision:
`json`/`jsonf` formats clipboard or rest, Tab minifies, Enter copies when valid else edits, Esc leaves edit. `b64`/`base64` encode and `b64d`/`base64d` decode in the search bar; Tab flips direction. Frontend only; no history.
Reason:
JSON needs a panel for multiline editing; Base64 is one-line in/out like calc.

## 2026-08-29 - Root search detects color values
Decision:
Typing `#ff6363`, `rgb()`, or `hsl()` (including alpha) opens the color panel with no prefix. `color` / `clr` is the same panel. Names come from `color-name`; recents are the last 10 unique clip colors. Enter copies HEX.
Reason:
Raycast shows a color preview from a bare hex; a prefix would hide the common case.

## 2026-08-29 - UI language follows the system
Decision:
Settings persist `locale` as `system` | `zh-CN` | `en` (default system). Any OS `zh*` locale becomes Simplified Chinese; everything else is English. zh-CN command titles stay `中文 · English`; English UI shows the English title only.
Reason:
English users cannot use Chinese labels or pinyin; following the OS avoids a first-launch language prompt.

## 2026-08-29 - Web search prefixes open the browser
Decision:
`gg`, `bd`, `bing`, `ddg`, and `sogou` search that engine in the default browser and hide. Unmatched queries still use the one default engine from settings. There is no search history, suggestions, or in-app results.
Reason:
Picking an engine is a prefix, not extra fallback rows; the browser already does search well.

## 2026-08-29 - Emoji is browse-first copy
Decision:
`em` / `emoji` browses `@emoji-mart/data` categories, with English keyword search as a helper. Copy writes the native glyph, shows a notice, then hides after 1.2s. Search uses the palette field, not a second box.
Reason:
The dataset already classifies Unicode emoji; Chinese users can browse, and a second search field would fight the launcher chrome.

## 2026-08-28 - Settings live in the palette; unmatched queries search the web
Decision:
`settings` persists `app_data_dir/settings.json`. Theme is dark or light (DESIGN inverse tokens, lavender accent). The palette hotkey rebinds through global-shortcut. Custom engines are http(s) URLs with `%s`. Unmatched queries of 2+ characters open the default engine.
Reason:
A launcher should finish a query on Enter, and settings should stay a prefix panel rather than a nested folder or a separate window.

## 2026-08-28 - User-facing text uses the UI sans font
Decision:
Lists, kbd chips, and other user-facing copy inherit `--font-sans`. Do not use Tailwind `font-mono` for clip bodies or labels that may contain CJK.
Reason:
`font-mono` has no CJK faces, so Chinese Windows falls back to SimSun.

## 2026-08-28 - Sensitive snippets are masked, not encrypted
Decision:
Snippets can be marked `sensitive`. The list shows `******` instead of the body; Enter still copies. Edit shows the full text. This is peek protection, not encryption.
Reason:
API keys and passwords should not sit in plaintext in a Glanceable list, but a launcher should not add a password vault.

## 2026-08-28 - Snippets are search-to-copy
Decision:
`sn` / `snippet` lists snippets and copies on Enter. Copying writes the system clipboard but adds no clip history row, because a stored template is not a new copy and recording it cluttered clip. `sn add` or Ctrl+N opens the create form, rows can edit/delete, and copy expands `{{date}}`, `{{time}}`, and `{{clipboard}}`. There is no auto-expand while typing, and no one-shot `sn add 标题 内容`.
Reason:
System-wide expansion needs input monitoring and misfires; clip-style search-and-copy matches the launcher.

## 2026-08-28 - System power commands
Decision:
`lock`, `sleep`, `shutdown`, `reboot`, and `logout` are action commands: Enter runs them and hides the palette. Power actions use `tauri-plugin-power-manager`; lock is a custom Rust command. They do not open a prefix panel.
Reason:
The plugin already covers the four power APIs, and a panel would add a step the launcher does not use.

## 2026-08-28 - App ranking uses icons, usage, and pinyin
Decision:
Root-search apps show extracted icons, rank by fuzzy match then launch count (`usage_count.json`), and match Chinese names with `pinyin-pro` (`wx` → 微信).
Reason:
The library has a full pinyin dictionary, so a hand-maintained alias table is unnecessary.

## 2026-08-28 - Apps launch from root search
Decision:
Installed apps appear in the palette root search. Typing matches names with existing fuzzy scoring; Enter launches. There is no `open` prefix command.
Reason:
Opening an app should be the default launcher action, without a prefix to remember.

## 2026-08-28 - Clip images preview in an overlay
Decision:
Image rows stay compact (40px thumbs). Full-size preview is a frontend overlay (Tab or thumbnail zoom), not an inline large image or a second Tauri window.
Reason:
Large in-list images break scan density; a palette-sized mask is enough and needs no Rust.

## 2026-08-28 - Clip records source app and dedupes
Decision:
A clip row stores the foreground app at copy time. Copying the same text or image again removes the old row and places one updated row at the top.
Reason:
Users need to see where a clip came from, and identical copies should be a single history item.

## 2026-08-28 - Clip paste keeps list order
Decision:
Pasting a clip item writes it to the clipboard and sends Ctrl/⌘+V after the palette hides. The history row stays where it is; `createdAt` is not bumped.
Reason:
Reordering on paste made it look like a new copy, and Enter with an empty `clip ` rest never reached paste.

## 2026-08-28 - Tray is the quit surface
Decision:
A tray icon stays while the palette is hidden. Left-click opens the palette; the menu has Open and Quit.
Reason:
`skipTaskbar` leaves no taskbar button, so the tray is the way to reopen or exit the resident process.

## 2026-08-28 - Clip images are files, text still wins
Decision:
Clipboard bitmaps save under `app_data_dir/clipboard/images/` and preview with `convertFileSrc`. A copy with real non-URL text is stored as text, not the accompanying bitmap. Image caps are in the 2026-08-29 200/5MB decision.
Reason:
Windows often attaches a DIB to formatted text; preferring text keeps ordinary copies from becoming image rows.

## 2026-08-28 - Clip is text history first
Decision:
`clip` listens with `tauri-plugin-clipboard-x`, stores text in `app_data_dir/clipboard/index.json`, and shows a color swatch when the copied string is hex/rgb/hsl.
Reason:
The plugin already watches the system clipboard while the launcher stays resident; color preview is a frontend regex plus a swatch.

## 2026-08-28 - Calc evaluates in the frontend
Decision:
The `calc` command evaluates expressions with mathjs in the frontend and copies the result on Enter. History is stored in `app_data_dir/calc-history.json` through Rust.
Reason:
Evaluation is a local string-in path; history has to survive quit, using the same app-data JSON pattern as todos.

## 2026-08-28 - Overlay ScrollArea
Decision:
Lists use `$lib/components/ScrollArea.svelte`: native overflow stays, the thumb is an overlay. Selected command rows use an inset 2px border, not outline.
Reason:
`overflow-y: auto` clips outside outlines, and the Windows native scrollbar does not match the glass palette.

## 2026-08-28 - Interruptible palette motion
Decision:
Palette show/hide uses CSS transitions (150ms in, 100ms out). Search glow pulses at 1.2s. Todo rows fly in/out; the todo field slides.
Reason:
Keyframes cannot reverse mid-toggle, and a 300ms glow loop would strobe on a always-on-top launcher.

## 2026-08-28 - Persist todos as JSON
Decision:
Store todos in `app_data_dir/todos.json` through Rust `get_todos` and `save_todos`. The frontend hydrates on boot and writes after each mutation.
Reason:
The launcher must keep todos after quit, using the OS app-data directory on both Windows and macOS.

## 2026-08-28 - Prefix command registry
Decision:
Commands register by prefix. `match` accepts the prefix or `prefix + space`; `suggest` fuzzy-matches incomplete input.
Reason:
This matches launcher typing without loading every command's UI up front.

## 2026-08-28 - Official SvelteKit template
Decision:
Use create-tauri-app's current `svelte-ts` template (SvelteKit + adapter-static SPA) instead of a separate Vite + `App.svelte` tree.
Reason:
That is what `pnpm create tauri-app --template svelte-ts` generates now, and it is the supported Tauri frontend path.

## 2026-08-28 - Platform hotkeys
Decision:
Toggle with Alt+Space on Windows and Command+K on macOS. Esc or losing focus hides the window after a short grace period.
Reason:
These match common launcher conventions, and blur-hide needs a grace period so `show()` does not immediately dismiss.

## 2026-08-28 - Frameless overlay launcher
Decision:
The palette is a 600×400 centered, always-on-top, skip-taskbar, transparent frameless window that starts hidden.
Reason:
A Spotlight-style launcher must overlay other apps without taskbar chrome or traffic lights.
