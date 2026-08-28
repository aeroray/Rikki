use std::collections::HashMap;
use std::fs;
use std::path::PathBuf;

use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Manager};

const USAGE_FILE: &str = "usage_count.json";

#[derive(Debug, Default, Serialize, Deserialize)]
struct UsageFile {
    counts: HashMap<String, u32>,
}

fn usage_path(app: &AppHandle) -> Result<PathBuf, String> {
    let dir = app
        .path()
        .app_data_dir()
        .map_err(|err| format!("resolve app data dir: {err}"))?;
    fs::create_dir_all(&dir).map_err(|err| format!("create app data dir: {err}"))?;
    Ok(dir.join(USAGE_FILE))
}

pub fn load_usage(app: &AppHandle) -> Result<HashMap<String, u32>, String> {
    let path = usage_path(app)?;
    if !path.exists() {
        return Ok(HashMap::new());
    }
    let data = fs::read_to_string(&path).map_err(|err| format!("read usage: {err}"))?;
    if data.trim().is_empty() {
        return Ok(HashMap::new());
    }
    let parsed: UsageFile = serde_json::from_str(&data).unwrap_or_default();
    Ok(parsed.counts)
}

pub fn increment_usage(app: &AppHandle, path: &str) -> Result<u32, String> {
    let mut counts = load_usage(app)?;
    let next = counts.get(path).copied().unwrap_or(0).saturating_add(1);
    counts.insert(path.to_string(), next);
    save_usage(app, &counts)?;
    Ok(next)
}

fn save_usage(app: &AppHandle, counts: &HashMap<String, u32>) -> Result<(), String> {
    let path = usage_path(app)?;
    let tmp = path.with_extension("json.tmp");
    let data = serde_json::to_string_pretty(&UsageFile {
        counts: counts.clone(),
    })
    .map_err(|err| format!("serialize usage: {err}"))?;
    fs::write(&tmp, data).map_err(|err| format!("write usage temp: {err}"))?;
    if path.exists() {
        fs::remove_file(&path).map_err(|err| format!("replace usage: {err}"))?;
    }
    fs::rename(&tmp, &path).map_err(|err| format!("commit usage: {err}"))?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::UsageFile;
    use std::collections::HashMap;

    #[test]
    fn usage_json_wraps_counts_map() {
        let mut counts = HashMap::new();
        counts.insert(r"C:\Start Menu\Chrome.lnk".into(), 5);
        let json = serde_json::to_string(&UsageFile { counts }).expect("serialize");
        assert!(json.contains("Chrome.lnk"));
        assert!(json.contains('5'));
        let parsed: UsageFile = serde_json::from_str(&json).expect("deserialize");
        assert_eq!(parsed.counts.values().next().copied(), Some(5));
    }
}
