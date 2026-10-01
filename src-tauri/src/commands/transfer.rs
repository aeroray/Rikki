//! Moving the user's own data between this machine and a file they choose.
//!
//! Two settings rows, two system dialogs, one JSON format. Export writes todos,
//! snippets and settings wherever the user points — a desktop, a sync folder, a
//! USB stick — and import replaces all three with a file they picked. The app
//! keeps no folder of its own and no history: a copy that is meant to travel
//! belongs where the user can reach it from another machine, and a second copy
//! inside `app_data_dir` is not that.

use std::fs;
use std::path::Path;

use serde::{Deserialize, Serialize};
use serde_json::Value;
use tauri::AppHandle;
use tauri_plugin_dialog::DialogExt;

use crate::storage::json_file::{self, JsonWrite};
use crate::storage::settings_store::{self, Settings};
use crate::storage::snippet_store::{self, Snippet};
use crate::storage::todo_store::{self, Todo};

const FORMAT_VERSION: u32 = 1;
const FILE_PREFIX: &str = "rikki-";

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TransferPayload {
    pub version: u32,
    pub exported_at: String,
    pub data: TransferData,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TransferData {
    pub todos: Vec<Todo>,
    pub snippets: Vec<Snippet>,
    pub settings: Settings,
}

/// The file the user picked, as the confirmation that follows needs it: the
/// path to hand back to `import_settings`, and the name to show.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PickedFile {
    pub path: String,
    pub name: String,
}

/// Writes the current data to a location the user picks.
#[tauri::command]
pub async fn export_settings(app: AppHandle, stamp: String) -> Result<Option<String>, String> {
    let _native = crate::begin_native_dialog(&app);
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
    // Read after the dialog rather than before it: what the file holds is then
    // the data as it stood when the user chose where to put it, and a dialog
    // they cancelled costs no reads at all.
    let payload = build_payload(&app)?;
    json_file::write_json(&path, &payload)?;
    Ok(Some(path.to_string_lossy().into_owned()))
}

/// Asks for a file and reads it, so the palette knows what it is asking about.
///
/// Reading here rather than after the confirmation keeps the second Enter
/// honest: a file that is not one of ours is refused while nothing has been
/// replaced, instead of after the user has already agreed to replace
/// everything.
#[tauri::command]
pub async fn pick_import_file(app: AppHandle) -> Result<Option<PickedFile>, String> {
    let _native = crate::begin_native_dialog(&app);
    let picked = tauri::async_runtime::spawn_blocking({
        let app = app.clone();
        move || {
            app.dialog()
                .file()
                .add_filter("JSON", &["json"])
                .blocking_pick_file()
        }
    })
    .await
    .map_err(|err| err.to_string())?;

    let Some(file) = picked else {
        return Ok(None);
    };
    let path = file.into_path().map_err(|err| err.to_string())?;
    read_payload(&path)?;
    Ok(Some(PickedFile {
        name: file_name(&path),
        path: path.to_string_lossy().into_owned(),
    }))
}

/// Replaces todos, snippets and settings with the contents of `path`.
///
/// All or nothing in two places. The whole file is parsed before anything is
/// written, so a truncated or hand-edited one changes nothing at all — there is
/// no per-part import, because two thirds of a restore applied is worse than
/// none of it. The three files are then committed together through
/// `write_all_or_nothing`: every temp written first, then the renames.
#[tauri::command(async)]
pub fn import_settings(app: AppHandle, path: String) -> Result<(), String> {
    let payload = read_payload(Path::new(path.trim()))?;
    let previous = settings_store::load_settings(&app)?;
    apply_payload(&app, payload, &previous)
}

fn build_payload(app: &AppHandle) -> Result<TransferPayload, String> {
    Ok(TransferPayload {
        version: FORMAT_VERSION,
        exported_at: rfc3339_utc(),
        data: TransferData {
            todos: todo_store::load_todos(app)?,
            snippets: snippet_store::load_snippets(app)?,
            settings: settings_store::load_settings(app)?,
        },
    })
}

fn read_payload(path: &Path) -> Result<TransferPayload, String> {
    let raw = fs::read_to_string(path).map_err(|err| format!("read {}: {err}", path.display()))?;
    parse_payload(&raw)
}

/// Parses a file in full, or not at all.
///
/// Every section has to be present and valid: a file that carries only some of
/// them was not written by this app, and importing it would be a merge — which
/// is a surface the launcher deliberately does not have.
fn parse_payload(raw: &str) -> Result<TransferPayload, String> {
    let root: Value = serde_json::from_str(raw).map_err(|err| format!("parse: {err}"))?;
    let version = root
        .get("version")
        .and_then(Value::as_u64)
        .ok_or_else(|| "the file has no version".to_string())?;
    if version != u64::from(FORMAT_VERSION) {
        return Err(format!("unsupported version: {version}"));
    }
    serde_json::from_value(root).map_err(|err| format!("read: {err}"))
}

fn apply_payload(
    app: &AppHandle,
    payload: TransferPayload,
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
        // does nothing — the one state an import must not end in.
        settings_store::update_setting(app, "hotkey", &settings_store::resolved_hotkey(previous))?;
    }
    Ok(())
}

fn file_name(path: &Path) -> String {
    path.file_name()
        .map(|name| name.to_string_lossy().into_owned())
        .unwrap_or_default()
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
    let date = now.get(..10).unwrap_or("rikki");
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
    use super::{civil_from_unix_days, file_stamp, parse_payload, utc_stamp, FORMAT_VERSION};

    fn export_json(sections: &str) -> String {
        format!(r#"{{"version":1,"exportedAt":"2026-08-29T00:00:00Z","data":{{{sections}}}}}"#)
    }

    const TODO: &str = r#""todos":[{"id":"a","text":"milk","done":false,"createdAt":1}]"#;
    const SNIPPET: &str = r#""snippets":[{"id":"s","title":"t","content":"c","keyword":"k","tags":[],"createdAt":1,"updatedAt":1}]"#;
    const SETTINGS: &str = r#""settings":{"defaultSearchEngine":"bing"}"#;

    #[test]
    fn unix_epoch_is_1970_01_01() {
        assert_eq!(civil_from_unix_days(0), (1970, 1, 1));
    }

    #[test]
    fn format_version_is_one() {
        assert_eq!(FORMAT_VERSION, 1);
    }

    #[test]
    fn a_complete_file_parses() {
        let raw = export_json(&format!("{TODO},{SNIPPET},{SETTINGS}"));
        let payload = parse_payload(&raw).expect("payload");
        assert_eq!(payload.exported_at, "2026-08-29T00:00:00Z");
        assert_eq!(payload.data.todos.len(), 1);
        assert_eq!(payload.data.snippets.len(), 1);
    }

    /// A file with one section missing was not written by this app, and
    /// importing it would be the merge the launcher deliberately does not have.
    #[test]
    fn a_file_missing_a_section_is_rejected_whole() {
        assert!(parse_payload(&export_json(&format!("{TODO},{SNIPPET}"))).is_err());
        assert!(parse_payload(&export_json(&format!("{TODO},{SETTINGS}"))).is_err());
        assert!(parse_payload(&export_json("")).is_err());
    }

    #[test]
    fn a_file_with_a_damaged_section_is_rejected_whole() {
        let damaged = r#""todos":[{"id":"a"}]"#;
        assert!(parse_payload(&export_json(&format!("{damaged},{SNIPPET},{SETTINGS}"))).is_err());
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
        // Anything else a name cannot hold is dropped rather than escaped, so
        // the stamp cannot carry a separator or a traversal into the name.
        assert_eq!(file_stamp("2026/10/01 14:32:05"), "20261001143205");
        assert_eq!(file_stamp("../../etc/passwd"), utc_stamp());
        assert_eq!(file_stamp(""), utc_stamp());
    }

    #[test]
    fn the_utc_fallback_stamp_keeps_the_shape_of_a_name() {
        let stamp = utc_stamp();
        assert_eq!(stamp.len(), 17, "{stamp}");
        assert_eq!(stamp.as_bytes()[10], b'-');
        assert!(stamp.chars().all(|c| c.is_ascii_digit() || c == '-'));
    }
}
