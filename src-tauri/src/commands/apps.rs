use std::collections::HashMap;
#[cfg(target_os = "macos")]
use std::process::Command;
use std::sync::Mutex;

use tauri::{AppHandle, Manager, State};

use crate::apps::{self, InstalledApp};

// Every lock in here recovers from poisoning instead of panicking. A panic
// while one of them was held used to poison the mutex, and each later `expect`
// then panicked as well, so a single unrelated panic took the tray thread and
// the global hotkey handler down with it. The value behind a poisoned lock is
// still the last one written, which beats aborting the app.
#[derive(Default)]
pub struct AppIndex {
    ready: Mutex<bool>,
    apps: Mutex<Vec<InstalledApp>>,
    scan: Mutex<()>,
}

impl AppIndex {
    pub fn snapshot(&self) -> Vec<InstalledApp> {
        self.apps
            .lock()
            .unwrap_or_else(|poisoned| poisoned.into_inner())
            .clone()
    }

    fn store(&self, apps: Vec<InstalledApp>) {
        *self
            .apps
            .lock()
            .unwrap_or_else(|poisoned| poisoned.into_inner()) = apps;
        *self
            .ready
            .lock()
            .unwrap_or_else(|poisoned| poisoned.into_inner()) = true;
    }

    fn is_ready(&self) -> bool {
        *self
            .ready
            .lock()
            .unwrap_or_else(|poisoned| poisoned.into_inner())
    }

    fn bump_usage(&self, path: &str, count: u32) {
        if let Some(entry) = self
            .apps
            .lock()
            .unwrap_or_else(|poisoned| poisoned.into_inner())
            .iter_mut()
            .find(|item| item.path == path)
        {
            entry.usage_count = count;
        }
    }
}

pub fn warm(app: &AppHandle) -> Result<(), String> {
    let index = app.state::<AppIndex>();
    let _scan = index
        .scan
        .lock()
        .unwrap_or_else(|poisoned| poisoned.into_inner());
    if index.is_ready() {
        return Ok(());
    }
    let apps = apps::load_or_refresh(app)?;
    index.store(apps);
    Ok(())
}

// `async` so the wait for the scan lock happens off the main thread. Without it
// the command runs inline on the main thread, and a cold start (no apps.json
// yet, so the whole Start Menu is walked and every icon extracted) freezes the
// window, the tray and the global hotkey for the duration.
#[tauri::command(async)]
pub fn get_installed_apps(app: AppHandle) -> Result<Vec<InstalledApp>, String> {
    warm(&app)?;
    Ok(app.state::<AppIndex>().snapshot())
}

// Spawns a process and then writes usage.json.
#[tauri::command(async)]
pub fn launch_app(app: AppHandle, path: String, index: State<AppIndex>) -> Result<(), String> {
    let apps = index.snapshot();
    let Some(target) = apps.iter().find(|item| item.path == path) else {
        return Err("unknown app".into());
    };
    open_path(&target.path)?;
    // Keep the count we are already showing when usage.json cannot be written.
    // Falling back to 0 dropped the app to the bottom of the sort order and
    // showed a zero in the UI even though the launch itself had succeeded.
    let count = crate::storage::usage_store::increment_usage(&app, &target.path)
        .unwrap_or(target.usage_count);
    index.bump_usage(&path, count);
    Ok(())
}

#[tauri::command(async)]
pub fn get_usage_counts(app: AppHandle) -> Result<HashMap<String, u32>, String> {
    crate::storage::usage_store::load_usage(&app)
}

/// Opens the folder an app lives in, with the file selected.
///
/// Selecting it is the point: opening the folder alone leaves the user to find the
/// file again, which is the part they were asking for. On Windows the path follows
/// `/select,` with no space, which is what the switch expects — `explorer
/// "/select, C:\…"` opens Documents instead, silently.
#[tauri::command(async)]
pub fn reveal_app(path: String) -> Result<(), String> {
    if !std::path::Path::new(&path).exists() {
        return Err(format!("{path} is not there any more"));
    }
    reveal(&path).map(|_| ()).map_err(|err| format!("could not open the folder: {err}"))
}

#[cfg(target_os = "windows")]
fn reveal(path: &str) -> std::io::Result<std::process::Child> {
    std::process::Command::new("explorer")
        .arg(format!("/select,{path}"))
        .spawn()
}

/// `open -R` is the same idea: reveal the file rather than launch it.
#[cfg(target_os = "macos")]
fn reveal(path: &str) -> std::io::Result<std::process::Child> {
    std::process::Command::new("open").arg("-R").arg(path).spawn()
}

// Called once per panel entry, and does a read-modify-write of usage.json.
#[tauri::command(async)]
pub fn bump_usage(app: AppHandle, key: String) -> Result<u32, String> {
    if !crate::storage::usage_store::is_command_usage_key(&key) {
        return Err("invalid usage key".into());
    }
    crate::storage::usage_store::increment_usage(&app, &key)
}

/// Hands a path to the OS shell: an app, a file, a folder or a shortcut.
///
/// Public within the crate because opening a folder in Explorer or Finder is the
/// same call, and the reasoning below is worth having once.
pub(crate) fn open_path(path: &str) -> Result<(), String> {
    #[cfg(target_os = "macos")]
    {
        Command::new("open")
            .arg(path)
            .spawn()
            .map_err(|err| format!("open path: {err}"))?;
        return Ok(());
    }

    #[cfg(target_os = "windows")]
    {
        use windows::core::PCWSTR;
        use windows::Win32::Foundation::HWND;
        use windows::Win32::UI::Shell::ShellExecuteW;
        use windows::Win32::UI::WindowsAndMessaging::SW_SHOWNORMAL;

        // This used to be `cmd /C start "" <path>`. cmd.exe re-parses the
        // argument itself and expands `%VAR%` even inside quotes, so a shortcut
        // literally named `%TEMP%.lnk` opened whatever TEMP points at.
        // ShellExecuteW takes the path verbatim and applies the same shell
        // resolution (shortcuts, file associations) that the Start Menu uses.
        let file = to_wide(path);
        let result = unsafe {
            ShellExecuteW(
                HWND::default(),
                PCWSTR::null(),
                PCWSTR(file.as_ptr()),
                PCWSTR::null(),
                PCWSTR::null(),
                SW_SHOWNORMAL,
            )
        };
        // ShellExecuteW reports failure as a value <= 32 rather than as a null
        // handle, so `is_invalid()` would call a failure a success.
        if (result.0 as isize) <= 32 {
            return Err(format!(
                "open path: ShellExecuteW failed ({})",
                result.0 as isize
            ));
        }
        return Ok(());
    }

    #[cfg(not(any(target_os = "macos", target_os = "windows")))]
    {
        let _ = path;
        Err("opening a path is only supported on Windows and macOS".into())
    }
}

#[cfg(target_os = "windows")]
fn to_wide(value: &str) -> Vec<u16> {
    value.encode_utf16().chain(std::iter::once(0)).collect()
}

#[cfg(test)]
mod tests {
    // The command line this replaced went through cmd.exe, which expanded
    // `%VAR%` even inside quotes. This locks in that the path reaches
    // ShellExecuteW as a single verbatim string.
    #[cfg(target_os = "windows")]
    #[test]
    fn launch_path_is_passed_verbatim() {
        let wide = super::to_wide(r"C:\Start Menu\%TEMP%.lnk");
        assert_eq!(wide.last().copied(), Some(0), "must stay null terminated");
        let text = String::from_utf16(&wide[..wide.len() - 1]).expect("utf16");
        assert_eq!(text, r"C:\Start Menu\%TEMP%.lnk");
    }
}
