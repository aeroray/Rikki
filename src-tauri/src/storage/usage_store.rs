use std::collections::HashMap;
use std::fs;
use std::path::PathBuf;
use std::sync::Mutex;

use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Manager};

use crate::storage::json_file;

const USAGE_FILE: &str = "usage_count.json";
const COMMAND_USAGE_PREFIX: &str = "command:";
const MAX_COMMAND_ID_LEN: usize = 40;

/// Serializes the read-modify-write in [`increment_usage`]. Tauri runs
/// synchronous commands on a thread pool, so a command visit and an app launch
/// landing together used to read the same counts and let the later write drop
/// the earlier increment.
static USAGE_LOCK: Mutex<()> = Mutex::new(());

pub fn is_command_usage_key(key: &str) -> bool {
    let Some(id) = key.strip_prefix(COMMAND_USAGE_PREFIX) else {
        return false;
    };
    !id.is_empty()
        && id.len() <= MAX_COMMAND_ID_LEN
        && id
            .bytes()
            .all(|b| b.is_ascii_lowercase() || b.is_ascii_digit() || b == b'-')
}

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
    let file = usage_path(app)?;
    Ok(json_file::read_json_or::<UsageFile>(&file, UsageFile::default).counts)
}

pub fn increment_usage(app: &AppHandle, path: &str) -> Result<u32, String> {
    let _guard = USAGE_LOCK
        .lock()
        .unwrap_or_else(|poisoned| poisoned.into_inner());
    let mut counts = load_usage(app)?;
    let next = counts.get(path).copied().unwrap_or(0).saturating_add(1);
    counts.insert(path.to_string(), next);
    save_usage(app, &counts)?;
    Ok(next)
}

fn save_usage(app: &AppHandle, counts: &HashMap<String, u32>) -> Result<(), String> {
    json_file::write_json(
        &usage_path(app)?,
        &UsageFile {
            counts: counts.clone(),
        },
    )
}

#[cfg(test)]
mod tests {
    use super::UsageFile;
    use std::collections::HashMap;

    #[test]
    fn command_usage_keys_are_namespaced() {
        assert!(super::is_command_usage_key("command:clip"));
        assert!(super::is_command_usage_key("command:web-gg"));
        assert!(super::is_command_usage_key("command:base64d"));
        assert!(!super::is_command_usage_key("clip"));
        assert!(!super::is_command_usage_key(r"C:\Start Menu\Chrome.lnk"));
        assert!(!super::is_command_usage_key("command:Clip"));
        assert!(!super::is_command_usage_key("command:"));
    }

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
