use std::fs;
use std::path::PathBuf;

use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Manager};

const HISTORY_FILE: &str = "calc-history.json";

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CalcHistoryEntry {
    pub id: String,
    pub expression: String,
    pub result: String,
    pub created_at: i64,
}

fn history_path(app: &AppHandle) -> Result<PathBuf, String> {
    let dir = app
        .path()
        .app_data_dir()
        .map_err(|err| format!("resolve app data dir: {err}"))?;
    fs::create_dir_all(&dir).map_err(|err| format!("create app data dir: {err}"))?;
    Ok(dir.join(HISTORY_FILE))
}

pub fn load_history(app: &AppHandle) -> Result<Vec<CalcHistoryEntry>, String> {
    let path = history_path(app)?;
    if !path.exists() {
        fs::write(&path, "[]").map_err(|err| format!("create calc history file: {err}"))?;
        return Ok(Vec::new());
    }

    let data = fs::read_to_string(&path).map_err(|err| format!("read calc history: {err}"))?;
    if data.trim().is_empty() {
        return Ok(Vec::new());
    }

    serde_json::from_str(&data).map_err(|err| format!("parse calc history: {err}"))
}

pub fn save_history(app: &AppHandle, entries: &[CalcHistoryEntry]) -> Result<(), String> {
    let path = history_path(app)?;
    let tmp = path.with_extension("json.tmp");
    let data = serde_json::to_string_pretty(entries)
        .map_err(|err| format!("serialize calc history: {err}"))?;
    fs::write(&tmp, data).map_err(|err| format!("write calc history temp: {err}"))?;
    if path.exists() {
        fs::remove_file(&path).map_err(|err| format!("replace calc history: {err}"))?;
    }
    fs::rename(&tmp, &path).map_err(|err| format!("commit calc history: {err}"))?;
    Ok(())
}
