use std::collections::HashSet;
use std::fs;
use std::path::{Path, PathBuf};
use std::time::SystemTime;

use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Manager};

use crate::storage::json_file;

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct InstalledApp {
    pub id: String,
    pub name: String,
    pub path: String,
    pub alias: String,
    #[serde(default)]
    pub icon: String,
    #[serde(default)]
    pub usage_count: u32,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct AppsCache {
    fingerprint: String,
    apps: Vec<InstalledApp>,
}

const APPS_FILE: &str = "apps.json";

pub fn load_or_refresh(app: &AppHandle) -> Result<Vec<InstalledApp>, String> {
    let roots = scan_roots(app);
    let cached = load_cache(app);
    let (mut apps, cache_hit, fingerprint) = if let Some(cached) = cached {
        let fingerprint = dir_fingerprint(&roots);
        if cached.fingerprint == fingerprint {
            (cached.apps, true, fingerprint)
        } else {
            (scan_apps(&roots), false, fingerprint)
        }
    } else {
        let apps = scan_apps(&roots);
        (apps, false, dir_fingerprint(&roots))
    };
    crate::apps_icons::attach_icons(app, &mut apps);
    apply_usage(app, &mut apps);
    if !cache_hit {
        // The cache is an optimisation, so failing to write it must not take the
        // whole app list down. Propagating the error here left "launch an app"
        // permanently broken on a full or read-only data directory, and made
        // every request rescan from scratch.
        if let Err(error) = save_cache(
            app,
            &AppsCache {
                fingerprint,
                apps: strip_runtime_fields(&apps),
            },
        ) {
            eprintln!("rikki: could not write the app cache: {error}");
        }
    }
    Ok(apps)
}

fn apply_usage(app: &AppHandle, apps: &mut [InstalledApp]) {
    let counts = crate::storage::usage_store::load_usage(app).unwrap_or_default();
    for entry in apps {
        entry.usage_count = counts.get(&entry.path).copied().unwrap_or(0);
    }
}

fn strip_runtime_fields(apps: &[InstalledApp]) -> Vec<InstalledApp> {
    apps.iter()
        .cloned()
        .map(|mut entry| {
            entry.icon.clear();
            entry.usage_count = 0;
            entry
        })
        .collect()
}

pub fn skip_shortcut_name(name: &str) -> bool {
    let lower = name.to_lowercase();
    lower.contains("uninstall") || lower.contains("卸载")
}

pub fn alias_for(name: &str) -> String {
    name.chars()
        .filter(|ch| ch.is_alphanumeric())
        .collect::<String>()
        .to_lowercase()
}

fn scan_roots(app: &AppHandle) -> Vec<PathBuf> {
    let mut roots = Vec::new();

    #[cfg(target_os = "macos")]
    {
        roots.push(PathBuf::from("/Applications"));
        if let Ok(home) = app.path().home_dir() {
            roots.push(home.join("Applications"));
        }
    }

    #[cfg(target_os = "windows")]
    {
        if let Ok(appdata) = std::env::var("APPDATA") {
            roots.push(PathBuf::from(appdata).join("Microsoft\\Windows\\Start Menu"));
        }
        if let Ok(programdata) = std::env::var("PROGRAMDATA") {
            roots.push(PathBuf::from(programdata).join("Microsoft\\Windows\\Start Menu"));
        }
        let _ = app;
    }

    #[cfg(not(any(target_os = "macos", target_os = "windows")))]
    {
        let _ = app;
    }

    roots
}

fn dir_fingerprint(roots: &[PathBuf]) -> String {
    let mut count = 0u64;
    let mut latest = 0u64;
    for root in roots {
        fingerprint_dir(root, &mut count, &mut latest);
    }
    format!("{count}:{latest}")
}

fn fingerprint_dir(dir: &Path, count: &mut u64, latest: &mut u64) {
    let Ok(entries) = fs::read_dir(dir) else {
        return;
    };
    for entry in entries.flatten() {
        let path = entry.path();
        // `entry.file_type()` does not follow links, unlike `entry.metadata()`.
        // The Start Menu folder is user-writable, so a junction pointing back at
        // an ancestor would recurse until the stack overflowed and the process
        // aborted.
        if entry.file_type().is_ok_and(|kind| kind.is_symlink()) {
            continue;
        }
        let Ok(meta) = entry.metadata() else {
            continue;
        };
        if meta.is_dir() {
            #[cfg(target_os = "macos")]
            if path.extension().is_some_and(|ext| ext == "app") {
                *count += 1;
                bump_mtime(&meta, latest);
                continue;
            }
            fingerprint_dir(&path, count, latest);
            continue;
        }
        #[cfg(target_os = "windows")]
        if path
            .extension()
            .is_some_and(|ext| ext.eq_ignore_ascii_case("lnk"))
        {
            *count += 1;
            bump_mtime(&meta, latest);
        }
    }
}

fn bump_mtime(meta: &fs::Metadata, latest: &mut u64) {
    if let Ok(mtime) = meta.modified() {
        if let Ok(duration) = mtime.duration_since(SystemTime::UNIX_EPOCH) {
            *latest = (*latest).max(duration.as_secs());
        }
    }
}

fn scan_apps(roots: &[PathBuf]) -> Vec<InstalledApp> {
    let mut apps = Vec::new();
    let mut seen_names = HashSet::new();
    let mut seen_paths = HashSet::new();
    for root in roots {
        collect_apps(root, &mut apps, &mut seen_names, &mut seen_paths);
    }
    apps.sort_by(|a, b| a.name.to_lowercase().cmp(&b.name.to_lowercase()));
    apps
}

fn collect_apps(
    dir: &Path,
    apps: &mut Vec<InstalledApp>,
    seen_names: &mut HashSet<String>,
    seen_paths: &mut HashSet<String>,
) {
    let Ok(entries) = fs::read_dir(dir) else {
        return;
    };
    for entry in entries.flatten() {
        let path = entry.path();

        // Skip links rather than following them: `path.is_dir()` would descend
        // through a junction that points at an ancestor and never come back.
        if entry.file_type().is_ok_and(|kind| kind.is_symlink()) {
            continue;
        }

        #[cfg(target_os = "macos")]
        {
            if path.extension().is_some_and(|ext| ext == "app") && path.is_dir() {
                if let Some(app) = read_macos_app(&path) {
                    push_app(app, apps, seen_names, seen_paths);
                }
                continue;
            }
            if path.is_dir() {
                collect_apps(&path, apps, seen_names, seen_paths);
            }
        }

        #[cfg(target_os = "windows")]
        {
            if path.is_dir() {
                collect_apps(&path, apps, seen_names, seen_paths);
                continue;
            }
            if path.extension().is_some_and(|ext| ext.eq_ignore_ascii_case("lnk")) {
                let display = path
                    .file_stem()
                    .and_then(|stem| stem.to_str())
                    .unwrap_or_default();
                if display.is_empty() || skip_shortcut_name(display) {
                    continue;
                }
                let path_str = path.to_string_lossy().into_owned();
                push_app(
                    InstalledApp {
                        id: path_str.clone(),
                        name: display.to_string(),
                        alias: alias_for(display),
                        path: path_str,
                        icon: String::new(),
                        usage_count: 0,
                    },
                    apps,
                    seen_names,
                    seen_paths,
                );
            }
        }

        #[cfg(not(any(target_os = "macos", target_os = "windows")))]
        {
            let _ = (path, apps, seen_names, seen_paths);
        }
    }
}

fn push_app(
    app: InstalledApp,
    apps: &mut Vec<InstalledApp>,
    seen_names: &mut HashSet<String>,
    seen_paths: &mut HashSet<String>,
) {
    if app.name.eq_ignore_ascii_case("rikki") {
        return;
    }
    let name_key = app.name.to_lowercase();
    if !seen_paths.insert(app.path.clone()) || !seen_names.insert(name_key) {
        return;
    }
    apps.push(app);
}

#[cfg(target_os = "macos")]
fn read_macos_app(path: &Path) -> Option<InstalledApp> {
    let info_path = path.join("Contents/Info.plist");
    let name = read_plist_name(&info_path).or_else(|| {
        path.file_stem()
            .and_then(|stem| stem.to_str())
            .map(str::to_string)
    })?;
    if skip_shortcut_name(&name) {
        return None;
    }
    let path_str = path.to_string_lossy().into_owned();
    Some(InstalledApp {
        id: path_str.clone(),
        alias: alias_for(&name),
        name,
        path: path_str,
        icon: String::new(),
        usage_count: 0,
    })
}

#[cfg(target_os = "macos")]
fn read_plist_name(path: &Path) -> Option<String> {
    let value = plist::Value::from_file(path).ok()?;
    let dict = value.as_dictionary()?;
    dict.get("CFBundleDisplayName")
        .or_else(|| dict.get("CFBundleName"))
        .and_then(|value| value.as_string())
        .map(str::to_string)
        .filter(|name| !name.is_empty())
}

fn cache_path(app: &AppHandle) -> Result<PathBuf, String> {
    let dir = app
        .path()
        .app_data_dir()
        .map_err(|err| format!("resolve app data dir: {err}"))?;
    fs::create_dir_all(&dir).map_err(|err| format!("create app data dir: {err}"))?;
    Ok(dir.join(APPS_FILE))
}

/// Reads the cache, treating every failure as a miss.
///
/// The app list is only a cache, so a data directory that cannot be resolved or
/// created must fall back to a fresh scan instead of failing the whole command.
/// Propagating the error here re-opened exactly the hole the `save_cache` path
/// had already closed: on a full or read-only data directory the cache write
/// was tolerated but the cache read still took "launch an app" down with it.
fn load_cache(app: &AppHandle) -> Option<AppsCache> {
    let path = match cache_path(app) {
        Ok(path) => path,
        Err(err) => {
            eprintln!("rikki: {err}");
            return None;
        }
    };
    match json_file::read_json::<AppsCache>(&path) {
        Ok(cache) => cache,
        Err(err) => {
            // A damaged file must fall back to a fresh scan as well.
            eprintln!("rikki: {err}");
            None
        }
    }
}

fn save_cache(app: &AppHandle, cache: &AppsCache) -> Result<(), String> {
    json_file::write_json(&cache_path(app)?, cache)
}

#[cfg(test)]
mod tests {
    use super::{alias_for, skip_shortcut_name, InstalledApp};

    #[test]
    fn skips_uninstallers() {
        assert!(skip_shortcut_name("Uninstall Chrome"));
        assert!(skip_shortcut_name("Chrome 卸载"));
        assert!(!skip_shortcut_name("Google Chrome"));
    }

    #[test]
    fn alias_keeps_letters_and_digits() {
        assert_eq!(alias_for("Google Chrome"), "googlechrome");
        assert_eq!(alias_for("VS Code"), "vscode");
    }

    #[test]
    fn app_json_uses_camel_case_fields() {
        let app = InstalledApp {
            id: "a".into(),
            name: "Chrome".into(),
            path: "/Applications/Google Chrome.app".into(),
            alias: "chrome".into(),
            icon: String::new(),
            usage_count: 0,
        };
        let json = serde_json::to_string(&app).expect("serialize");
        assert!(json.contains("\"name\""));
        assert!(!json.contains("created_at"));
        let parsed: InstalledApp = serde_json::from_str(&json).expect("deserialize");
        assert_eq!(parsed.alias, "chrome");
    }
}
