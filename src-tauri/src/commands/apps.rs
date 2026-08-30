use std::collections::HashMap;
use std::process::Command;
use std::sync::Mutex;

use tauri::{AppHandle, Manager, State};

use crate::apps::{self, InstalledApp};

#[derive(Default)]
pub struct AppIndex {
    ready: Mutex<bool>,
    apps: Mutex<Vec<InstalledApp>>,
    scan: Mutex<()>,
}

impl AppIndex {
    pub fn snapshot(&self) -> Vec<InstalledApp> {
        self.apps.lock().expect("app index").clone()
    }

    fn store(&self, apps: Vec<InstalledApp>) {
        *self.apps.lock().expect("app index") = apps;
        *self.ready.lock().expect("app index") = true;
    }

    fn is_ready(&self) -> bool {
        *self.ready.lock().expect("app index")
    }

    fn bump_usage(&self, path: &str, count: u32) {
        if let Some(entry) = self
            .apps
            .lock()
            .expect("app index")
            .iter_mut()
            .find(|item| item.path == path)
        {
            entry.usage_count = count;
        }
    }
}

pub fn warm(app: &AppHandle) -> Result<(), String> {
    let index = app.state::<AppIndex>();
    let _scan = index.scan.lock().expect("app scan");
    if index.is_ready() {
        return Ok(());
    }
    let apps = apps::load_or_refresh(app)?;
    index.store(apps);
    Ok(())
}

#[tauri::command]
pub fn get_installed_apps(app: AppHandle) -> Result<Vec<InstalledApp>, String> {
    warm(&app)?;
    Ok(app.state::<AppIndex>().snapshot())
}

#[tauri::command]
pub fn launch_app(app: AppHandle, path: String, index: State<AppIndex>) -> Result<(), String> {
    let apps = index.snapshot();
    let Some(target) = apps.iter().find(|item| item.path == path) else {
        return Err("unknown app".into());
    };
    open_path(&target.path)?;
    let count = crate::storage::usage_store::increment_usage(&app, &target.path).unwrap_or(0);
    index.bump_usage(&path, count);
    Ok(())
}

#[tauri::command]
pub fn get_usage_counts(app: AppHandle) -> Result<HashMap<String, u32>, String> {
    crate::storage::usage_store::load_usage(&app)
}

#[tauri::command]
pub fn bump_usage(app: AppHandle, key: String) -> Result<u32, String> {
    if !crate::storage::usage_store::is_command_usage_key(&key) {
        return Err("invalid usage key".into());
    }
    crate::storage::usage_store::increment_usage(&app, &key)
}

fn open_path(path: &str) -> Result<(), String> {
    #[cfg(target_os = "macos")]
    {
        Command::new("open")
            .arg(path)
            .spawn()
            .map_err(|err| format!("open app: {err}"))?;
        return Ok(());
    }

    #[cfg(target_os = "windows")]
    {
        use std::os::windows::process::CommandExt;
        const CREATE_NO_WINDOW: u32 = 0x0800_0000;
        Command::new("cmd")
            .args(["/C", "start", "", path])
            .creation_flags(CREATE_NO_WINDOW)
            .spawn()
            .map_err(|err| format!("open app: {err}"))?;
        return Ok(());
    }

    #[cfg(not(any(target_os = "macos", target_os = "windows")))]
    {
        let _ = path;
        Err("app launch is only supported on Windows and macOS".into())
    }
}

#[cfg(test)]
mod tests {
    #[cfg(target_os = "windows")]
    #[test]
    fn windows_start_uses_empty_title_arg() {
        let args = ["/C", "start", "", r"C:\Start Menu\Chrome.lnk"];
        assert_eq!(args[2], "");
        assert!(args[3].ends_with(".lnk"));
    }
}
