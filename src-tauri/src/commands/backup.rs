//! Backups: one folder the app owns, and one file format.
//!
//! Exporting used to be a save dialog and importing an open dialog, which is a
//! system modal in front of a 600×400 floating palette: it takes the screen,
//! takes focus, and asks for a directory walk in an app whose whole premise is
//! that you type and press Enter. The folder below is the answer — every backup
//! lands in a fixed, timestamped place the palette can list, so restoring is
//! arrows and Enter, and the dialogs survive only as explicit escape hatches
//! (`save_backup_copy`, `pick_backup_file`) for getting a file out to, or in
//! from, somewhere else.

use std::fs;
use std::path::{Path, PathBuf};

use serde::{Deserialize, Serialize};
use serde_json::Value;
use tauri::{AppHandle, Manager};
use tauri_plugin_dialog::DialogExt;

use crate::storage::json_file::{self, JsonWrite};
use crate::storage::settings_store::{self, Settings};
use crate::storage::snippet_store::{self, Snippet};
use crate::storage::todo_store::{self, Todo};

const BACKUP_VERSION: u32 = 1;
const BACKUP_DIR: &str = "backups";
const FILE_PREFIX: &str = "rikki-";
/// How many backups the palette is told about. The list scrolls, so this is not
/// a limit on what is kept — only on how many files are opened on every settings
/// entry, and 20 is already more than anyone picks from.
const LIST_LIMIT: usize = 20;

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BackupPayload {
    pub version: u32,
    pub exported_at: String,
    pub data: BackupData,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BackupData {
    pub todos: Vec<Todo>,
    pub snippets: Vec<Snippet>,
    pub settings: Settings,
}

/// What the palette shows about one backup file, and all it ever gets: a file
/// that cannot be read reports `valid: false` rather than disappearing from the
/// list, because a backup that quietly vanished is worse than one that says so.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct BackupFile {
    pub name: String,
    pub path: String,
    pub exported_at: String,
    pub todos: usize,
    pub snippets: usize,
    pub valid: bool,
}

#[tauri::command(async)]
pub fn list_backups(app: AppHandle) -> Result<Vec<BackupFile>, String> {
    let dir = backups_dir(&app)?;
    let entries = fs::read_dir(&dir).map_err(|err| format!("read backup dir: {err}"))?;
    let mut files: Vec<BackupFile> = entries
        .flatten()
        .map(|entry| entry.path())
        // Any `.json` in the folder counts, not just the names this app writes:
        // the folder belongs to the app, so a file that is in it was put there
        // deliberately — dropping a copy in is a way to import it.
        .filter(|path| {
            path.extension()
                .is_some_and(|ext| ext.eq_ignore_ascii_case("json"))
        })
        .map(|path| describe(&path))
        .collect();
    // Newest first. An unreadable file has no timestamp to sort by, so it lands
    // at the end, which is where a row that only says "cannot read" belongs.
    files.sort_by(|a, b| b.exported_at.cmp(&a.exported_at));
    files.truncate(LIST_LIMIT);
    Ok(files)
}

/// Writes the current data into the backup folder.
///
/// `stamp` is the user's local clock, formatted by the frontend. Local rather
/// than UTC on purpose: the file name is what they read in Explorer or Finder,
/// and a name eight hours off their own clock makes the folder look broken.
#[tauri::command(async)]
pub fn create_backup(app: AppHandle, stamp: String) -> Result<BackupFile, String> {
    let payload = build_payload(&app)?;
    let path = unique_path(&backups_dir(&app)?, &file_stamp(&stamp));
    write_payload(&path, &payload)?;
    Ok(BackupFile {
        name: file_name(&path),
        path: path.to_string_lossy().into_owned(),
        exported_at: payload.exported_at,
        todos: payload.data.todos.len(),
        snippets: payload.data.snippets.len(),
        valid: true,
    })
}

/// Reads a backup from anywhere, for the import screen to show before it
/// replaces anything. Only the header comes back, never the contents.
#[tauri::command(async)]
pub fn inspect_backup(path: String) -> Result<BackupFile, String> {
    let path = PathBuf::from(path.trim());
    if !path.is_file() {
        return Err("backup file not found".into());
    }
    let payload = read_payload(&path)?;
    Ok(BackupFile {
        name: file_name(&path),
        path: path.to_string_lossy().into_owned(),
        exported_at: payload.exported_at,
        todos: payload.data.todos.len(),
        snippets: payload.data.snippets.len(),
        valid: true,
    })
}

/// Replaces todos, snippets and settings with the contents of `path`.
///
/// All or nothing in three places. The whole file is parsed before anything is
/// written, so a truncated or hand-edited one changes nothing at all and the
/// old per-part "partial import" — which could leave two thirds of a restore
/// applied — no longer exists. The three files are then committed together. And
/// the data being replaced is written to the backup folder first: that snapshot
/// is both the undo and the reason a failure to write it cancels the import.
#[tauri::command(async)]
pub fn import_backup_from(app: AppHandle, path: String, stamp: String) -> Result<(), String> {
    let payload = read_payload(Path::new(path.trim()))?;

    let previous = settings_store::load_settings(&app)?;
    let snapshot = build_payload(&app)?;
    let snapshot_path = unique_path(&backups_dir(&app)?, &file_stamp(&stamp));
    write_payload(&snapshot_path, &snapshot)?;

    apply_payload(&app, payload, &previous)
}

/// Writes the current data to a location the user picks.
#[tauri::command]
pub async fn save_backup_copy(app: AppHandle, stamp: String) -> Result<Option<String>, String> {
    crate::set_ignore_blur(&app, true);
    let result = save_copy_inner(app.clone(), stamp).await;
    crate::set_ignore_blur(&app, false);
    if let Some(window) = app.get_webview_window("main") {
        let _ = window.set_focus();
    }
    result
}

/// Asks for a backup file and hands the path back without importing it, so the
/// palette can show what the file holds before anything is replaced.
#[tauri::command]
pub async fn pick_backup_file(app: AppHandle) -> Result<Option<String>, String> {
    crate::set_ignore_blur(&app, true);
    let result = pick_inner(app.clone()).await;
    crate::set_ignore_blur(&app, false);
    if let Some(window) = app.get_webview_window("main") {
        let _ = window.set_focus();
    }
    result
}

#[tauri::command(async)]
pub fn open_backups_dir(app: AppHandle) -> Result<(), String> {
    let dir = backups_dir(&app)?;
    crate::commands::apps::open_path(&dir.to_string_lossy())
}

fn backups_dir(app: &AppHandle) -> Result<PathBuf, String> {
    let dir = app
        .path()
        .app_data_dir()
        .map_err(|err| format!("resolve app data dir: {err}"))?
        .join(BACKUP_DIR);
    fs::create_dir_all(&dir).map_err(|err| format!("create backup dir: {err}"))?;
    Ok(dir)
}

async fn save_copy_inner(app: AppHandle, stamp: String) -> Result<Option<String>, String> {
    let payload = build_payload(&app)?;
    let json = serde_json::to_string_pretty(&payload)
        .map_err(|err| format!("serialize backup: {err}"))?;
    let name = format!("{FILE_PREFIX}{}.json", file_stamp(&stamp));
    let picked = tauri::async_runtime::spawn_blocking({
        let app = app.clone();
        move || {
            app.dialog()
                .file()
                .add_filter("JSON", &["json"])
                .set_file_name(&name)
                .blocking_save_file()
        }
    })
    .await
    .map_err(|err| err.to_string())?;

    let Some(file) = picked else {
        return Ok(None);
    };
    let path = file.into_path().map_err(|err| err.to_string())?;
    fs::write(&path, json).map_err(|err| format!("write backup: {err}"))?;
    Ok(Some(path.to_string_lossy().into_owned()))
}

async fn pick_inner(app: AppHandle) -> Result<Option<String>, String> {
    let dir = backups_dir(&app).ok();
    let picked = tauri::async_runtime::spawn_blocking(move || {
        let mut dialog = app.dialog().file().add_filter("JSON", &["json"]);
        // Opening where the app's own backups are is the common case; a file
        // from somewhere else is one directory change away.
        if let Some(dir) = dir {
            dialog = dialog.set_directory(dir);
        }
        dialog.blocking_pick_file()
    })
    .await
    .map_err(|err| err.to_string())?;

    Ok(picked
        .map(|file| file.into_path())
        .transpose()
        .map_err(|err| err.to_string())?
        .map(|path| path.to_string_lossy().into_owned()))
}

fn build_payload(app: &AppHandle) -> Result<BackupPayload, String> {
    Ok(BackupPayload {
        version: BACKUP_VERSION,
        exported_at: rfc3339_utc(),
        data: BackupData {
            todos: todo_store::load_todos(app)?,
            snippets: snippet_store::load_snippets(app)?,
            settings: settings_store::load_settings(app)?,
        },
    })
}

fn write_payload(path: &Path, payload: &BackupPayload) -> Result<(), String> {
    json_file::write_json(path, payload)
}

fn read_payload(path: &Path) -> Result<BackupPayload, String> {
    let raw = fs::read_to_string(path).map_err(|err| format!("read backup: {err}"))?;
    parse_payload(&raw)
}

/// Parses a backup in full, or not at all.
///
/// Every section has to be present and valid: a file that carries only some of
/// them is not a backup this app wrote, and importing it would be a merge —
/// which is a surface the launcher deliberately does not have.
fn parse_payload(raw: &str) -> Result<BackupPayload, String> {
    let root: Value = serde_json::from_str(raw).map_err(|err| format!("parse backup: {err}"))?;
    let version = root
        .get("version")
        .and_then(Value::as_u64)
        .ok_or_else(|| "backup is missing version".to_string())?;
    if version != u64::from(BACKUP_VERSION) {
        return Err(format!("unsupported backup version: {version}"));
    }
    serde_json::from_value(root).map_err(|err| format!("read backup: {err}"))
}

fn apply_payload(
    app: &AppHandle,
    payload: BackupPayload,
    previous: &Settings,
) -> Result<(), String> {
    let settings = settings_store::normalize_imported(payload.data.settings);
    let todo_path = todo_store::todo_path(app)?;
    let snippet_path = snippet_store::snippet_path(app)?;
    let settings_path = settings_store::settings_path(app)?;
    let writes = [
        JsonWrite::new(&todo_path, &payload.data.todos)?,
        JsonWrite::new(&snippet_path, &payload.data.snippets)?,
        JsonWrite::new(&settings_path, &settings)?,
    ];
    json_file::write_all_or_nothing(&writes)?;

    let hotkey = settings_store::resolved_hotkey(&settings);
    if crate::apply_hotkey(app, &hotkey).is_err() {
        // The imported shortcut is taken, so the machine keeps the previous one.
        // Leaving the restored settings claiming it would advertise a key that
        // does nothing — the one state a restore must not end in.
        settings_store::update_setting(app, "hotkey", &settings_store::resolved_hotkey(previous))?;
    }
    Ok(())
}

fn describe(path: &Path) -> BackupFile {
    let name = file_name(path);
    let text = path.to_string_lossy().into_owned();
    match read_payload(path) {
        Ok(payload) => BackupFile {
            name,
            path: text,
            exported_at: payload.exported_at,
            todos: payload.data.todos.len(),
            snippets: payload.data.snippets.len(),
            valid: true,
        },
        Err(_) => BackupFile {
            name,
            path: text,
            exported_at: String::new(),
            todos: 0,
            snippets: 0,
            valid: false,
        },
    }
}

fn file_name(path: &Path) -> String {
    path.file_name()
        .map(|name| name.to_string_lossy().into_owned())
        .unwrap_or_default()
}

/// `rikki-<stamp>.json`, stepping aside rather than overwriting.
///
/// Two backups inside the same second are easy to make — a double Enter, or an
/// import whose snapshot lands in the second the user just backed up in — and
/// the second write would silently destroy the first.
fn unique_path(dir: &Path, stamp: &str) -> PathBuf {
    let first = dir.join(format!("{FILE_PREFIX}{stamp}.json"));
    if !first.exists() {
        return first;
    }
    for suffix in 2..1000 {
        let candidate = dir.join(format!("{FILE_PREFIX}{stamp}-{suffix}.json"));
        if !candidate.exists() {
            return candidate;
        }
    }
    first
}

/// Reduces the clock the frontend sent to what a file name may contain.
fn file_stamp(raw: &str) -> String {
    let cleaned: String = raw
        .chars()
        .filter(|c| c.is_ascii_digit() || *c == '-')
        .take(20)
        .collect();
    if cleaned.is_empty() {
        utc_stamp()
    } else {
        cleaned
    }
}

/// The fallback name, from the same clock the payload records.
fn utc_stamp() -> String {
    let now = rfc3339_utc();
    let date = now.get(..10).unwrap_or("backup");
    let time = now.get(11..19).unwrap_or("000000").replace(':', "");
    format!("{date}-{time}")
}

fn rfc3339_utc() -> String {
    let secs = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_secs())
        .unwrap_or(0);
    let (year, month, day) = civil_from_unix_days((secs / 86400) as i64);
    let rem = secs % 86400;
    format!(
        "{year:04}-{month:02}-{day:02}T{:02}:{:02}:{:02}Z",
        rem / 3600,
        (rem % 3600) / 60,
        rem % 60
    )
}

fn civil_from_unix_days(unix_days: i64) -> (i32, u32, u32) {
    let z = unix_days + 719468;
    let era = if z >= 0 { z } else { z - 146096 } / 146097;
    let doe = (z - era * 146097) as u64;
    let yoe = (doe - doe / 1460 + doe / 36524 - doe / 146096) / 365;
    let y = yoe as i32 + era as i32 * 400;
    let doy = doe - (365 * yoe + yoe / 4 - yoe / 100);
    let mp = (5 * doy + 2) / 153;
    let d = (doy - (153 * mp + 2) / 5 + 1) as u32;
    let m = if mp < 10 { mp + 3 } else { mp - 9 } as u32;
    let y = if m <= 2 { y + 1 } else { y };
    (y, m, d)
}

#[cfg(test)]
mod tests {
    use super::{
        civil_from_unix_days, file_stamp, parse_payload, unique_path, utc_stamp, BACKUP_VERSION,
    };

    fn backup_json(sections: &str) -> String {
        format!(
            r#"{{"version":1,"exportedAt":"2026-08-29T00:00:00Z","data":{{{sections}}}}}"#
        )
    }

    const TODO: &str = r#""todos":[{"id":"a","text":"milk","done":false,"createdAt":1}]"#;
    const SNIPPET: &str = r#""snippets":[{"id":"s","title":"t","content":"c","keyword":"k","tags":[],"createdAt":1,"updatedAt":1}]"#;
    const SETTINGS: &str = r#""settings":{"defaultSearchEngine":"bing"}"#;

    #[test]
    fn unix_epoch_is_1970_01_01() {
        assert_eq!(civil_from_unix_days(0), (1970, 1, 1));
    }

    #[test]
    fn backup_version_is_one() {
        assert_eq!(BACKUP_VERSION, 1);
    }

    #[test]
    fn a_complete_backup_parses() {
        let raw = backup_json(&format!("{TODO},{SNIPPET},{SETTINGS}"));
        let payload = parse_payload(&raw).expect("backup");
        assert_eq!(payload.exported_at, "2026-08-29T00:00:00Z");
        assert_eq!(payload.data.todos.len(), 1);
        assert_eq!(payload.data.snippets.len(), 1);
    }

    /// A file with one section missing is not a backup this app wrote, and
    /// importing it would be the merge the launcher deliberately does not have.
    #[test]
    fn a_backup_missing_a_section_is_rejected_whole() {
        assert!(parse_payload(&backup_json(&format!("{TODO},{SNIPPET}"))).is_err());
        assert!(parse_payload(&backup_json(&format!("{TODO},{SETTINGS}"))).is_err());
        assert!(parse_payload(&backup_json("")).is_err());
    }

    #[test]
    fn a_backup_with_a_damaged_section_is_rejected_whole() {
        let damaged = r#""todos":[{"id":"a"}]"#;
        assert!(parse_payload(&backup_json(&format!("{damaged},{SNIPPET},{SETTINGS}"))).is_err());
    }

    #[test]
    fn only_version_one_is_accepted() {
        assert!(parse_payload(r#"{"version":2,"data":{}}"#).is_err());
        assert!(parse_payload(r#"{"data":{}}"#).is_err());
        assert!(parse_payload("not json").is_err());
    }

    #[test]
    fn the_clock_the_frontend_sent_is_reduced_to_a_file_name() {
        assert_eq!(file_stamp("2026-10-01-143205"), "2026-10-01-143205");
        assert_eq!(file_stamp("  2026-10-01-143205  "), "2026-10-01-143205");
        // Anything else a name cannot hold is dropped rather than escaped, and a
        // path that reaches the command cannot climb out of the backup folder.
        assert_eq!(file_stamp("2026/10/01 14:32:05"), "20261001143205");
        assert_eq!(file_stamp("../../etc/passwd"), utc_stamp());
        assert_eq!(file_stamp(""), utc_stamp());
    }

    #[test]
    fn a_second_backup_in_the_same_second_does_not_replace_the_first() {
        let dir = std::env::temp_dir().join("rikki-backup-unique");
        let _ = std::fs::remove_dir_all(&dir);
        std::fs::create_dir_all(&dir).expect("temp dir");

        let first = unique_path(&dir, "2026-10-01-143205");
        std::fs::write(&first, "{}").expect("seed");
        let second = unique_path(&dir, "2026-10-01-143205");
        assert_ne!(first, second);
        assert_eq!(
            second.file_name().unwrap().to_string_lossy(),
            "rikki-2026-10-01-143205-2.json"
        );
        assert!(first.exists(), "the earlier backup must survive");

        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn the_utc_fallback_stamp_keeps_the_shape_of_a_name() {
        let stamp = utc_stamp();
        assert_eq!(stamp.len(), 17, "{stamp}");
        assert_eq!(stamp.as_bytes()[10], b'-');
        assert!(stamp.chars().all(|c| c.is_ascii_digit() || c == '-'));
    }
}
