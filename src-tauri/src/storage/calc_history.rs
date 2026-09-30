use std::fs;
use std::path::PathBuf;

use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Manager};

use crate::storage::json_file;

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
    Ok(json_file::read_json::<Vec<CalcHistoryEntry>>(&path)?.unwrap_or_default())
}

pub fn save_history(app: &AppHandle, entries: &[CalcHistoryEntry]) -> Result<(), String> {
    json_file::write_json(&history_path(app)?, &entries)
}
