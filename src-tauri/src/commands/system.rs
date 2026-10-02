use std::process::Command;
use std::sync::Mutex;
use std::time::{SystemTime, UNIX_EPOCH};

use serde::Serialize;
use tauri::State;

/// One of the five power commands.
///
/// All five take a delay, so they share one scheduler. Three of them can be run by
/// the OS on a timer; lock and sleep cannot, and those are held in a thread of our
/// own — see `schedule` for why the split is where it is.
#[derive(Clone, Copy, PartialEq)]
enum Action {
    Lock,
    Sleep,
    Shutdown,
    Restart,
    Logout,
}

impl Action {
    fn parse(value: &str) -> Result<Self, String> {
        match value {
            "lock" => Ok(Self::Lock),
            "sleep" => Ok(Self::Sleep),
            "shutdown" => Ok(Self::Shutdown),
            "restart" => Ok(Self::Restart),
            "logout" => Ok(Self::Logout),
            other => Err(format!("unknown power action: {other}")),
        }
    }

    fn as_str(self) -> &'static str {
        match self {
            Self::Lock => "lock",
            Self::Sleep => "sleep",
            Self::Shutdown => "shutdown",
            Self::Restart => "restart",
            Self::Logout => "logout",
        }
    }

    /// Whether the OS can hold this one's timer.
    ///
    /// Shutdown and restart have `shutdown.exe` / `System Events`; log out has
    /// neither a timer nor a way to abort one. Lock and sleep are not "system
    /// shutdown" operations at all — the OS offers no scheduled form of either — so
    /// they run from a thread that sleeps first.
    fn is_os_scheduled(self) -> bool {
        matches!(self, Self::Shutdown | Self::Restart)
    }
}

/// An action waiting on its timer.
///
/// Held in the app rather than read back from the OS. Windows does not publish the
/// pending schedule anywhere reachable without elevation — the registry key this
/// first tried does not exist, and `shutdown.exe` reports one only by *refusing* a
/// second schedule — so the honest options were to remember what this app set, or
/// to offer no cancel at all. The cost is that a timer started from a terminal is
/// not shown here; `cancel_power` still stops it, because it asks the OS.
#[derive(Default)]
pub struct ScheduledPower(Mutex<Option<Scheduled>>);

#[derive(Clone)]
struct Scheduled {
    action: Action,
    /// Epoch seconds when it fires.
    at: u64,
    /// Set when the delay is held by a thread of ours rather than by the OS, so
    /// `cancel` knows which way to stop it.
    cancel: Option<CancelHandle>,
}

#[derive(Clone)]
enum CancelHandle {
    /// Windows: nothing to hold, because `shutdown.exe` owns the timer and `/a`
    /// stops it.
    #[allow(dead_code)]
    Os,
    /// macOS: the pid of the detached `sh -c 'sleep … && osascript …'`.
    #[cfg(target_os = "macos")]
    Pid(u32),
    /// A thread of ours, which is stopped by setting this flag.
    Flag(std::sync::Arc<std::sync::atomic::AtomicBool>),
}

/// What the footer shows while a timer runs.
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PendingPower {
    action: String,
    /// Seconds until it fires, never negative.
    seconds_left: u64,
}

fn now() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|since| since.as_secs())
        .unwrap_or(0)
}

/// Schedules one of the five actions.
///
/// `seconds` is the delay; zero means now. The OS runs the timer where it can,
/// because that outlives this process, shows the user its own warning, and can be
/// cancelled by the same mechanism that set it.
///
/// Nothing here needs elevation. Windows' `shutdown.exe` and macOS' `System Events`
/// act on behalf of the current user, which is the only user a launcher has any
/// business acting for.
#[tauri::command(async)]
pub fn schedule_power(
    action: String,
    seconds: u64,
    state: State<'_, ScheduledPower>,
) -> Result<(), String> {
    let action = Action::parse(&action)?;
    // Windows' own ceiling is ten years, and anything past it is silently clamped
    // there rather than reported, so refuse it here instead.
    if seconds > 315_360_000 {
        return Err("the delay is longer than the system allows".into());
    }
    // A second OS-scheduled shutdown is refused by the OS itself; replacing one
    // with a thread of ours is not possible, so refuse it before touching state.
    let handle = schedule(action, seconds)?;
    let mut slot = state.0.lock().unwrap_or_else(|poisoned| poisoned.into_inner());
    // Anything already pending is replaced, and its own timer stopped, so two
    // countdowns cannot run at once. A failure to stop the old one is worth a line
    // rather than silence: it would leave the machine acting on both.
    if let Some(previous) = slot.take() {
        if let Err(err) = stop(previous.cancel) {
            eprintln!("rikki: could not stop the previous timer: {err}");
        }
    }
    *slot = Some(Scheduled {
        action,
        at: now() + seconds,
        cancel: handle,
    });
    Ok(())
}

/// Cancels a scheduled action.
///
/// Asks the OS as well as clearing the record, so a timer this app did not set —
/// one from a terminal, or from before a restart — is cancelled too.
#[tauri::command(async)]
pub fn cancel_power(state: State<'_, ScheduledPower>) -> Result<(), String> {
    let scheduled = {
        let mut slot = state.0.lock().unwrap_or_else(|poisoned| poisoned.into_inner());
        slot.take()
    };
    let Some(scheduled) = scheduled else {
        // Nothing of ours. The OS may still have one, so still ask it.
        return cancel_os();
    };
    let result = match scheduled.cancel {
        Some(CancelHandle::Os) | None => cancel_os(),
        Some(handle) => stop(Some(handle)).map(|_| ()),
    };
    result
}

/// The timer still running, if any.
#[tauri::command(async)]
pub fn pending_power(state: State<'_, ScheduledPower>) -> Option<PendingPower> {
    let slot = state.0.lock().unwrap_or_else(|poisoned| poisoned.into_inner());
    let scheduled = slot.as_ref()?;
    let left = scheduled.at.saturating_sub(now());
    // Fired, or about to: nothing left to offer.
    if left == 0 {
        return None;
    }
    Some(PendingPower {
        action: scheduled.action.as_str().to_string(),
        seconds_left: left,
    })
}

/// Runs an action immediately, with no timer.
fn run_now(action: Action) -> Result<(), String> {
    match action {
        Action::Lock => lock_screen(),
        Action::Sleep => system_shutdown::sleep().map_err(|err| format!("sleep: {err}")),
        Action::Logout => system_shutdown::logout().map_err(|err| format!("logout: {err}")),
        Action::Shutdown => system_shutdown::shutdown().map_err(|err| format!("shutdown: {err}")),
        Action::Restart => system_shutdown::reboot().map_err(|err| format!("restart: {err}")),
    }
}

/// Starts the timer and reports how to stop it.
fn schedule(action: Action, seconds: u64) -> Result<Option<CancelHandle>, String> {
    if seconds == 0 {
        return run_now(action).map(|_| None);
    }
    if action.is_os_scheduled() {
        return schedule_with_os(action, seconds);
    }
    // Lock, sleep and logout: no OS timer exists, so a thread waits and then runs
    // it. The flag is what `cancel` sets, and the thread checks it once, at the end
    // — a `sleep` cannot be interrupted, so a cancel during the wait is noticed
    // only when the wait finishes. That is the price of a delay the OS will not
    // hold, and it is why the countdown is shown rather than the timer trusted.
    let cancelled = std::sync::Arc::new(std::sync::atomic::AtomicBool::new(false));
    let flag = cancelled.clone();
    std::thread::spawn(move || {
        std::thread::sleep(std::time::Duration::from_secs(seconds));
        if flag.load(std::sync::atomic::Ordering::SeqCst) {
            return;
        }
        if let Err(err) = run_now(action) {
            eprintln!("rikki: scheduled {} failed: {err}", action.as_str());
        }
    });
    Ok(Some(CancelHandle::Flag(cancelled)))
}

/// Stops whatever kind of timer is running.
fn stop(handle: Option<CancelHandle>) -> Result<(), String> {
    match handle {
        None => Ok(()),
        Some(CancelHandle::Os) => cancel_os(),
        #[cfg(target_os = "macos")]
        Some(CancelHandle::Pid(pid)) => {
            let status = Command::new("kill")
                .args(["-TERM", &pid.to_string()])
                .status()
                .map_err(|err| format!("cancel: {err}"))?;
            if status.success() {
                Ok(())
            } else {
                Err("nothing is scheduled".into())
            }
        }
        Some(CancelHandle::Flag(flag)) => {
            flag.store(true, std::sync::atomic::Ordering::SeqCst);
            Ok(())
        }
    }
}

#[tauri::command]
pub fn lock_screen() -> Result<(), String> {
    #[cfg(target_os = "macos")]
    {
        Command::new("/System/Library/CoreServices/Menu Extras/User.menu/Contents/Resources/CGSession")
            .arg("-suspend")
            .spawn()
            .map_err(|err| format!("lock screen: {err}"))?;
        return Ok(());
    }

    #[cfg(target_os = "windows")]
    {
        use std::os::windows::process::CommandExt;
        const CREATE_NO_WINDOW: u32 = 0x0800_0000;
        Command::new("rundll32.exe")
            .arg("user32.dll,LockWorkStation")
            .creation_flags(CREATE_NO_WINDOW)
            .spawn()
            .map_err(|err| format!("lock screen: {err}"))?;
        return Ok(());
    }

    #[cfg(not(any(target_os = "macos", target_os = "windows")))]
    Err("lock screen is only supported on Windows and macOS".into())
}

// ---------------------------------------------------------------- Windows

#[cfg(target_os = "windows")]
fn schedule_with_os(action: Action, seconds: u64) -> Result<Option<CancelHandle>, String> {
    use std::os::windows::process::CommandExt;
    const CREATE_NO_WINDOW: u32 = 0x0800_0000;

    let flag = match action {
        Action::Restart => "/r",
        _ => "/s",
    };
    let status = Command::new("shutdown.exe")
        .args([flag, "/t", &seconds.to_string()])
        .creation_flags(CREATE_NO_WINDOW)
        .status()
        .map_err(|err| format!("schedule: {err}"))?;
    if status.success() {
        return Ok(Some(CancelHandle::Os));
    }
    // 1190 is "a system shutdown has already been scheduled", which is the one
    // failure worth naming: the fix is to cancel the other one first, and a bare
    // exit code says none of that.
    if status.code() == Some(1190) {
        return Err("a shutdown is already scheduled".into());
    }
    Err(format!("the system refused the schedule ({status})"))
}

#[cfg(target_os = "windows")]
fn cancel_os() -> Result<(), String> {
    use std::os::windows::process::CommandExt;
    const CREATE_NO_WINDOW: u32 = 0x0800_0000;

    let status = Command::new("shutdown.exe")
        .arg("/a")
        .creation_flags(CREATE_NO_WINDOW)
        .status()
        .map_err(|err| format!("cancel: {err}"))?;
    if status.success() {
        return Ok(());
    }
    // 1116 is "no shutdown was in progress".
    if status.code() == Some(1116) {
        return Err("nothing is scheduled".into());
    }
    Err(format!("the system refused the cancellation ({status})"))
}

// ------------------------------------------------------------------ macOS

/// macOS has no `shutdown.exe`, and `System Events` has no timer, so the delay is
/// held by a detached `sleep` that then runs the AppleScript.
///
/// The child is deliberately not waited on: it has to outlive the palette, and the
/// app itself is usually still running in the tray. Its pid is returned so `cancel`
/// can stop it, which is the only handle on a timer that lives outside this process.
///
/// `System Events` asks for the user's permission the first time. That is the same
/// mechanism the power-manager plugin already uses for the immediate commands, so
/// it is a prompt this app would have shown anyway.
#[cfg(target_os = "macos")]
fn schedule_with_os(action: Action, seconds: u64) -> Result<Option<CancelHandle>, String> {
    let verb = match action {
        Action::Restart => "restart",
        _ => "shut down",
    };
    let script =
        format!("sleep {seconds} && osascript -e 'tell application \"System Events\" to {verb}'");
    let child = Command::new("/bin/sh")
        .arg("-c")
        .arg(&script)
        .spawn()
        .map_err(|err| format!("schedule: {err}"))?;
    Ok(Some(CancelHandle::Pid(child.id())))
}

#[cfg(target_os = "macos")]
fn cancel_os() -> Result<(), String> {
    Err("nothing is scheduled".into())
}

// ------------------------------------------------------------------ other

#[cfg(not(any(target_os = "macos", target_os = "windows")))]
fn schedule_with_os(_action: Action, _seconds: u64) -> Result<Option<CancelHandle>, String> {
    Err("scheduled power is only supported on Windows and macOS".into())
}

#[cfg(not(any(target_os = "macos", target_os = "windows")))]
fn cancel_os() -> Result<(), String> {
    Err("scheduled power is only supported on Windows and macOS".into())
}

#[cfg(test)]
mod tests {
    use super::Action;

    #[test]
    fn an_unknown_action_is_refused() {
        // The frontend sends this string, and a typo must not fall through to a
        // shutdown because `match` had a catch-all.
        for known in ["lock", "sleep", "shutdown", "restart", "logout"] {
            assert!(Action::parse(known).is_ok(), "{known} should parse");
        }
        assert!(Action::parse("hibernate").is_err());
        assert!(Action::parse("").is_err());
    }

    #[test]
    fn only_shutdown_and_restart_use_the_os_timer() {
        // Log out has no timer the OS can abort, and lock and sleep are not
        // shutdown operations at all. Getting this wrong means a cancel that
        // silently does nothing.
        assert!(Action::Shutdown.is_os_scheduled());
        assert!(Action::Restart.is_os_scheduled());
        assert!(!Action::Logout.is_os_scheduled());
        assert!(!Action::Lock.is_os_scheduled());
        assert!(!Action::Sleep.is_os_scheduled());
    }

    #[test]
    fn the_action_name_round_trips() {
        // `pending_power` sends this string to the footer, which looks it up in the
        // catalog, so a name that does not round-trip is a blank label.
        for known in ["lock", "sleep", "shutdown", "restart", "logout"] {
            let parsed = Action::parse(known).expect("parses");
            assert_eq!(parsed.as_str(), known);
        }
    }
}
