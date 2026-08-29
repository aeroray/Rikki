use serde::{Deserialize, Serialize};
use serde_json::Value;
use tauri::{AppHandle, Manager};
use tauri_plugin_dialog::DialogExt;

use crate::storage::settings_store::{self, Settings};
use crate::storage::snippet_store::{self, Snippet};
use crate::storage::todo_store::{self, Todo};

const BACKUP_VERSION: u32 = 1;

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

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ImportResult {
    pub cancelled: bool,
    pub todos: bool,
    pub snippets: bool,
    pub settings: bool,
    pub settings_value: Option<Settings>,
}

#[tauri::command]
pub async fn export_backup(app: AppHandle) -> Result<bool, String> {
    crate::set_ignore_blur(&app, true);
    let result = export_inner(app.clone()).await;
    crate::set_ignore_blur(&app, false);
    if !matches!(result, Ok(true)) {
        if let Some(window) = app.get_webview_window("main") {
            let _ = window.set_focus();
        }
    }
    result
}

#[tauri::command]
pub async fn import_backup(app: AppHandle) -> Result<ImportResult, String> {
    crate::set_ignore_blur(&app, true);
    let result = import_inner(app.clone()).await;
    crate::set_ignore_blur(&app, false);
    if let Some(window) = app.get_webview_window("main") {
        let _ = window.set_focus();
    }
    result
}

async fn export_inner(app: AppHandle) -> Result<bool, String> {
    let payload = build_payload(&app)?;
    let json = serde_json::to_string_pretty(&payload).map_err(|err| format!("serialize backup: {err}"))?;
    let name = format!("rikki-{}.json", payload.exported_at.get(..10).unwrap_or("backup"));
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
        return Ok(false);
    };
    let path = file.into_path().map_err(|err| err.to_string())?;
    std::fs::write(&path, json).map_err(|err| format!("write backup: {err}"))?;
    Ok(true)
}

async fn import_inner(app: AppHandle) -> Result<ImportResult, String> {
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
        return Ok(ImportResult {
            cancelled: true,
            todos: false,
            snippets: false,
            settings: false,
            settings_value: None,
        });
    };
    let path = file.into_path().map_err(|err| err.to_string())?;
    let raw = std::fs::read_to_string(&path).map_err(|err| format!("read backup: {err}"))?;
    apply_backup(&app, &raw)
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

fn apply_backup(app: &AppHandle, raw: &str) -> Result<ImportResult, String> {
    let data = parse_backup_data(raw)?;

    let mut result = ImportResult {
        cancelled: false,
        todos: false,
        snippets: false,
        settings: false,
        settings_value: None,
    };

    match parse_part::<Vec<Todo>>(&data, "todos") {
        Ok(todos) => {
            result.todos = todo_store::save_todos(app, &todos).is_ok();
        }
        Err(_) => {}
    }
    match parse_part::<Vec<Snippet>>(&data, "snippets") {
        Ok(snippets) => {
            result.snippets = snippet_store::save_snippets(app, &snippets).is_ok();
        }
        Err(_) => {}
    }
    match parse_part::<Settings>(&data, "settings") {
        Ok(settings) => {
            let settings = settings_store::normalize_imported(settings);
            if settings_store::save_settings(app, &settings).is_ok() {
                let hotkey = settings_store::resolved_hotkey(&settings);
                let _ = crate::apply_hotkey(app, &hotkey);
                result.settings = true;
                result.settings_value = Some(settings_store::load_settings(app).unwrap_or(settings));
            }
        }
        Err(_) => {}
    }
    Ok(result)
}

fn parse_backup_data(raw: &str) -> Result<Value, String> {
    let root: Value = serde_json::from_str(raw).map_err(|err| format!("parse backup: {err}"))?;
    let version = root
        .get("version")
        .and_then(Value::as_u64)
        .ok_or_else(|| "backup is missing version".to_string())?;
    if version != u64::from(BACKUP_VERSION) {
        return Err(format!("unsupported backup version: {version}"));
    }
    let data = root
        .get("data")
        .cloned()
        .ok_or_else(|| "backup is missing data".to_string())?;
    if !data.is_object() {
        return Err("backup data must be an object".into());
    }
    Ok(data)
}

fn parse_part<T: serde::de::DeserializeOwned>(data: &Value, key: &str) -> Result<T, ()> {
    let Some(value) = data.get(key) else {
        return Err(());
    };
    serde_json::from_value(value.clone()).map_err(|_| ())
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
    use super::{civil_from_unix_days, parse_backup_data, parse_part, BACKUP_VERSION};
    use serde_json::json;

    #[test]
    fn unix_epoch_is_1970_01_01() {
        assert_eq!(civil_from_unix_days(0), (1970, 1, 1));
    }

    #[test]
    fn parse_part_reads_todos_array() {
        let data = json!({
            "todos": [{ "id": "a", "text": "milk", "done": false, "createdAt": 1 }]
        });
        let todos: Vec<crate::storage::todo_store::Todo> = parse_part(&data, "todos").expect("todos");
        assert_eq!(todos[0].text, "milk");
    }

    #[test]
    fn parse_part_rejects_missing_key() {
        let data = json!({ "snippets": [] });
        let result: Result<Vec<crate::storage::todo_store::Todo>, ()> = parse_part(&data, "todos");
        assert!(result.is_err());
    }

    #[test]
    fn backup_version_is_one() {
        assert_eq!(BACKUP_VERSION, 1);
    }

    #[test]
    fn parse_backup_data_requires_version_one_and_object() {
        let data = parse_backup_data(
            r#"{"version":1,"exportedAt":"2026-08-29T00:00:00Z","data":{"todos":[]}}"#,
        )
        .expect("backup");
        assert!(data.is_object());
        assert!(parse_backup_data(r#"{"version":2,"data":{}}"#).is_err());
        assert!(parse_backup_data(r#"{"data":{}}"#).is_err());
        assert!(parse_backup_data(r#"{"version":1,"data":[]}"#).is_err());
    }
}
