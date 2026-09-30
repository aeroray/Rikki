//! Shared JSON persistence helpers.
//!
//! Every store used to open-code the same `write tmp -> remove_file(target) ->
//! rename(tmp, target)` sequence. Removing the destination before the rename is
//! both unnecessary and unsafe: `std::fs::rename` already replaces an existing
//! destination on Unix and on Windows (`MoveFileExW` with
//! `MOVEFILE_REPLACE_EXISTING`), while the remove/rename pair leaves a window in
//! which the file does not exist at all, so a crash or power loss inside it
//! destroys the user's data.

use std::fs;
use std::path::{Path, PathBuf};
use std::time::{SystemTime, UNIX_EPOCH};

use serde::de::DeserializeOwned;
use serde::Serialize;

/// Writes `data` as pretty JSON, replacing `path` atomically.
pub fn write_json<T: Serialize + ?Sized>(path: &Path, data: &T) -> Result<(), String> {
    let tmp = tmp_path(path);
    let json = serde_json::to_string_pretty(data)
        .map_err(|err| format!("serialize {}: {err}", label(path)))?;
    fs::write(&tmp, json).map_err(|err| format!("write {} temp: {err}", label(path)))?;
    fs::rename(&tmp, path).map_err(|err| {
        let _ = fs::remove_file(&tmp);
        format!("commit {}: {err}", label(path))
    })
}

/// Reads JSON from `path`.
///
/// `Ok(None)` means the file is missing or empty. An unreadable file is moved
/// aside (see [`quarantine`]) and reported as `Err`: leaving it in place would
/// make every later write fail, which is how a single bad byte used to disable
/// settings persistence for good.
pub fn read_json<T: DeserializeOwned>(path: &Path) -> Result<Option<T>, String> {
    if !path.exists() {
        return Ok(None);
    }
    let data = fs::read_to_string(path).map_err(|err| format!("read {}: {err}", label(path)))?;
    if data.trim().is_empty() {
        return Ok(None);
    }
    match serde_json::from_str::<T>(&data) {
        Ok(value) => Ok(Some(value)),
        Err(err) => {
            let moved = quarantine(path);
            Err(match moved {
                Some(backup) => format!(
                    "parse {}: {err} (kept a copy at {})",
                    label(path),
                    backup.to_string_lossy()
                ),
                None => format!("parse {}: {err}", label(path)),
            })
        }
    }
}

/// Reads JSON, falling back to the caller's default when the file is missing,
/// empty, or damaged. Damaged files are quarantined rather than dropped.
pub fn read_json_or<T: DeserializeOwned>(path: &Path, fallback: impl FnOnce() -> T) -> T {
    match read_json::<T>(path) {
        Ok(Some(value)) => value,
        Ok(None) => fallback(),
        Err(err) => {
            eprintln!("rikki: {err}");
            fallback()
        }
    }
}

/// Moves a damaged file next to its original so the bytes are recoverable.
fn quarantine(path: &Path) -> Option<PathBuf> {
    let stamp = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|duration| duration.as_secs())
        .unwrap_or(0);
    let replacement = format!("json.corrupt-{stamp}");
    let backup = path.with_extension(replacement);
    fs::rename(path, &backup).ok().map(|()| backup)
}

fn tmp_path(path: &Path) -> PathBuf {
    let mut name = path.file_name().unwrap_or_default().to_os_string();
    name.push(".tmp");
    path.with_file_name(name)
}

fn label(path: &Path) -> String {
    path.file_name()
        .map(|name| name.to_string_lossy().into_owned())
        .unwrap_or_else(|| path.to_string_lossy().into_owned())
}

#[cfg(test)]
mod tests {
    use super::{read_json, read_json_or, write_json};
    use serde::{Deserialize, Serialize};

    #[derive(Debug, PartialEq, Serialize, Deserialize)]
    struct Sample {
        value: u32,
    }

    fn temp_dir(tag: &str) -> std::path::PathBuf {
        let dir = std::env::temp_dir().join(format!("rikki-json-file-{tag}"));
        let _ = std::fs::remove_dir_all(&dir);
        std::fs::create_dir_all(&dir).expect("temp dir");
        dir
    }

    #[test]
    fn write_replaces_existing_file_without_removing_it_first() {
        let dir = temp_dir("replace");
        let path = dir.join("settings.json");
        write_json(&path, &Sample { value: 1 }).expect("first write");
        write_json(&path, &Sample { value: 2 }).expect("second write");
        assert_eq!(read_json::<Sample>(&path).expect("read"), Some(Sample { value: 2 }));
        assert!(!path.with_file_name("settings.json.tmp").exists());
        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn missing_file_reads_as_none() {
        let dir = temp_dir("missing");
        let path = dir.join("todos.json");
        assert_eq!(read_json::<Sample>(&path).expect("read"), None);
        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn corrupt_file_is_quarantined_and_does_not_block_later_writes() {
        let dir = temp_dir("corrupt");
        let path = dir.join("settings.json");
        std::fs::write(&path, "{ not json").expect("seed corrupt");
        assert!(read_json::<Sample>(&path).is_err());
        assert!(!path.exists(), "corrupt file should be moved aside");
        let quarantined = std::fs::read_dir(&dir)
            .expect("list")
            .flatten()
            .any(|entry| entry.file_name().to_string_lossy().contains(".corrupt-"));
        assert!(quarantined, "a copy of the damaged file should remain");
        write_json(&path, &Sample { value: 7 }).expect("write after recovery");
        assert_eq!(read_json::<Sample>(&path).expect("read"), Some(Sample { value: 7 }));
        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn read_json_or_uses_fallback_for_missing_and_corrupt_files() {
        let dir = temp_dir("fallback");
        let path = dir.join("usage_count.json");
        assert_eq!(read_json_or(&path, || Sample { value: 5 }), Sample { value: 5 });
        std::fs::write(&path, "nope").expect("seed corrupt");
        assert_eq!(read_json_or(&path, || Sample { value: 9 }), Sample { value: 9 });
        let _ = std::fs::remove_dir_all(&dir);
    }
}
