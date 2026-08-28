use std::collections::HashSet;
use std::fs;
use std::path::{Path, PathBuf};
use std::time::SystemTime;

use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Manager};

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
    let fingerprint = dir_fingerprint(&roots);
    let (mut apps, cache_hit) = if let Some(cached) = load_cache(app)? {
        if cached.fingerprint == fingerprint {
            (cached.apps, true)
        } else {
            (scan_apps(&roots), false)
        }
    } else {
        (scan_apps(&roots), false)
    };
    crate::apps_icons::attach_icons(app, &mut apps);
    apply_usage(app, &mut apps);
    if !cache_hit {
        save_cache(
            app,
            &AppsCache {
                fingerprint,
                apps: strip_runtime_fields(&apps),
            },
        )?;
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

fn load_cache(app: &AppHandle) -> Result<Option<AppsCache>, String> {
    let path = cache_path(app)?;
    if !path.exists() {
        return Ok(None);
    }
    let data = fs::read_to_string(&path).map_err(|err| format!("read apps cache: {err}"))?;
    if data.trim().is_empty() {
        return Ok(None);
    }
    Ok(serde_json::from_str(&data).ok())
}

fn save_cache(app: &AppHandle, cache: &AppsCache) -> Result<(), String> {
    let path = cache_path(app)?;
    let tmp = path.with_extension("json.tmp");
    let data =
        serde_json::to_string_pretty(cache).map_err(|err| format!("serialize apps: {err}"))?;
    fs::write(&tmp, data).map_err(|err| format!("write apps temp: {err}"))?;
    if path.exists() {
        fs::remove_file(&path).map_err(|err| format!("replace apps: {err}"))?;
    }
    fs::rename(&tmp, &path).map_err(|err| format!("commit apps: {err}"))?;
    Ok(())
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
