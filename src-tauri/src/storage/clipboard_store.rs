use std::fs;
use std::path::PathBuf;

use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Manager};

const CLIP_DIR: &str = "clipboard";
const INDEX_FILE: &str = "index.json";
const MAX_ENTRIES: usize = 200;

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ClipboardEntry {
    pub id: String,
    #[serde(rename = "type")]
    pub kind: String,
    pub content: String,
    #[serde(default)]
    pub app_name: String,
    pub created_at: i64,
    #[serde(default)]
    pub pinned: bool,
}

fn index_path(app: &AppHandle) -> Result<PathBuf, String> {
    let dir = app
        .path()
        .app_data_dir()
        .map_err(|err| format!("resolve app data dir: {err}"))?
        .join(CLIP_DIR);
    fs::create_dir_all(&dir).map_err(|err| format!("create clipboard dir: {err}"))?;
    Ok(dir.join(INDEX_FILE))
}

pub fn load_entries(app: &AppHandle) -> Result<Vec<ClipboardEntry>, String> {
    let path = index_path(app)?;
    if !path.exists() {
        fs::write(&path, "[]").map_err(|err| format!("create clipboard index: {err}"))?;
        return Ok(Vec::new());
    }

    let data = fs::read_to_string(&path).map_err(|err| format!("read clipboard index: {err}"))?;
    if data.trim().is_empty() {
        return Ok(Vec::new());
    }

    serde_json::from_str(&data).map_err(|err| format!("parse clipboard index: {err}"))
}

pub fn save_entries(app: &AppHandle, entries: &[ClipboardEntry]) -> Result<(), String> {
    let path = index_path(app)?;
    let tmp = path.with_extension("json.tmp");
    let data = serde_json::to_string_pretty(entries)
        .map_err(|err| format!("serialize clipboard index: {err}"))?;
    fs::write(&tmp, data).map_err(|err| format!("write clipboard temp: {err}"))?;
    if path.exists() {
        fs::remove_file(&path).map_err(|err| format!("replace clipboard index: {err}"))?;
    }
    fs::rename(&tmp, &path).map_err(|err| format!("commit clipboard index: {err}"))?;
    Ok(())
}

pub fn prune(entries: Vec<ClipboardEntry>) -> Vec<ClipboardEntry> {
    if entries.len() <= MAX_ENTRIES {
        return entries;
    }
    let mut pinned: Vec<_> = entries.iter().filter(|e| e.pinned).cloned().collect();
    let mut rest: Vec<_> = entries.into_iter().filter(|e| !e.pinned).collect();
    let keep = MAX_ENTRIES.saturating_sub(pinned.len());
    rest.truncate(keep);
    pinned.append(&mut rest);
    pinned.sort_by(|a, b| b.created_at.cmp(&a.created_at));
    pinned
}
