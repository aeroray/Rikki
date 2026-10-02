use std::process::Command;
use std::sync::Mutex;
use std::time::{SystemTime, UNIX_EPOCH};

use serde::Serialize;
use tauri::State;

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

/// A shutdown or restart waiting on its timer.
///
/// Held in the app rather than read back from the OS. Windows does not publish the
/// pending schedule anywhere reachable without elevation — the registry key this
/// first tried does not exist, and `shutdown.exe` reports it only by *refusing* a
/// second schedule — so the honest options were to remember what this app set, or
/// to offer no cancel at all. The cost is that a timer started from a terminal is
/// not shown here; `cancel_power` still stops it, because it asks the OS.
#[derive(Default)]
pub struct ScheduledPower(Mutex<Option<Scheduled>>);

#[derive(Clone)]
struct Scheduled {
    action: String,
    /// Epoch seconds when it fires.
    at: u64,
    /// macOS only: the detached `sleep` to stop. Windows cancels by asking the OS.
    pid: Option<u32>,
}

/// What the footer shows while a timer runs.
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PendingPower {
    /// `shutdown` or `restart`.
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

/// Schedules a shutdown or restart.
///
/// `seconds` is the delay; zero means now. Both platforms run their own timer
/// rather than one of ours: it outlives this process, the OS shows the user its own
/// warning, and cancelling is the same mechanism that set it.
///
/// Neither needs elevation. Windows' `shutdown.exe` and macOS' `System Events`
/// schedule on behalf of the current user, which is the only user a launcher has
/// any business acting for.
#[tauri::command(async)]
pub fn schedule_power(
    action: String,
    seconds: u64,
    state: State<'_, ScheduledPower>,
) -> Result<(), String> {
    let mode = Mode::parse(&action)?;
    // Windows' own ceiling is ten years, and anything past it is silently clamped
    // there rather than reported, so refuse it here instead.
    if seconds > 315_360_000 {
        return Err("the delay is longer than the system allows".into());
    }
    let pid = schedule(mode, seconds)?;
    let mut slot = state.0.lock().unwrap_or_else(|poisoned| poisoned.into_inner());
    *slot = Some(Scheduled {
        action: action.clone(),
        at: now() + seconds,
        pid,
    });
    Ok(())
}

/// Cancels a scheduled shutdown or restart.
///
/// Asks the OS rather than only clearing the record, so a timer this app did not
/// set — one from a terminal, or from before a restart — is cancelled too.
#[tauri::command(async)]
pub fn cancel_power(state: State<'_, ScheduledPower>) -> Result<(), String> {
    let pid = {
        let slot = state.0.lock().unwrap_or_else(|poisoned| poisoned.into_inner());
        slot.as_ref().and_then(|scheduled| scheduled.pid)
    };
    cancel(pid)?;
    let mut slot = state.0.lock().unwrap_or_else(|poisoned| poisoned.into_inner());
    *slot = None;
    Ok(())
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
        action: scheduled.action.clone(),
        seconds_left: left,
    })
}

#[derive(Clone, Copy, PartialEq)]
enum Mode {
    Shutdown,
    Restart,
}

impl Mode {
    fn parse(value: &str) -> Result<Self, String> {
        match value {
            "shutdown" => Ok(Self::Shutdown),
            "restart" => Ok(Self::Restart),
            other => Err(format!("unknown power action: {other}")),
        }
    }
}

#[cfg(target_os = "windows")]
fn schedule(mode: Mode, seconds: u64) -> Result<Option<u32>, String> {
    use std::os::windows::process::CommandExt;
    const CREATE_NO_WINDOW: u32 = 0x0800_0000;

    let flag = match mode {
        Mode::Shutdown => "/s",
        Mode::Restart => "/r",
    };
    let status = Command::new("shutdown.exe")
        .args([flag, "/t", &seconds.to_string()])
        .creation_flags(CREATE_NO_WINDOW)
        .status()
        .map_err(|err| format!("schedule: {err}"))?;
    if status.success() {
        return Ok(None);
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
fn cancel(_pid: Option<u32>) -> Result<(), String> {
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

/// macOS has no `shutdown.exe`, and `System Events` has no timer, so the delay is
/// held by a detached `sleep` that then runs the AppleScript.
///
/// The child is deliberately not waited on: it has to outlive the palette, and the
/// app itself is usually still running in the tray. Its pid is returned so
/// `cancel` can stop it, which is the only handle on a timer that lives outside
/// this process.
///
/// `System Events` asks for the user's permission the first time. That is the same
/// mechanism the power-manager plugin already uses for the immediate commands, so
/// it is a prompt this app would have shown anyway.
#[cfg(target_os = "macos")]
fn schedule(mode: Mode, seconds: u64) -> Result<Option<u32>, String> {
    let verb = match mode {
        Mode::Shutdown => "shut down",
        Mode::Restart => "restart",
    };
    let script = format!(
        "sleep {seconds} && osascript -e 'tell application \"System Events\" to {verb}'"
    );
    let child = Command::new("/bin/sh")
        .arg("-c")
        .arg(&script)
        .spawn()
        .map_err(|err| format!("schedule: {err}"))?;
    Ok(Some(child.id()))
}

#[cfg(target_os = "macos")]
fn cancel(pid: Option<u32>) -> Result<(), String> {
    let Some(pid) = pid else {
        return Err("nothing is scheduled".into());
    };
    // SIGTERM to the `sh -c`, which takes the `sleep` with it.
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

#[cfg(not(any(target_os = "macos", target_os = "windows")))]
fn schedule(_mode: Mode, _seconds: u64) -> Result<Option<u32>, String> {
    Err("scheduled power is only supported on Windows and macOS".into())
}

#[cfg(not(any(target_os = "macos", target_os = "windows")))]
fn cancel(_pid: Option<u32>) -> Result<(), String> {
    Err("scheduled power is only supported on Windows and macOS".into())
}

#[cfg(test)]
mod tests {
    use super::Mode;

    #[test]
    fn an_unknown_action_is_refused() {
        // The frontend sends this string, and a typo must not fall through to a
        // shutdown because `match` had a catch-all.
        assert!(Mode::parse("shutdown").is_ok());
        assert!(Mode::parse("restart").is_ok());
        assert!(Mode::parse("hibernate").is_err());
        assert!(Mode::parse("").is_err());
    }
}
