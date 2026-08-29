use std::collections::HashSet;
use std::fs;
use std::path::{Path, PathBuf};

use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Manager};

const CLIP_DIR: &str = "clipboard";
const INDEX_FILE: &str = "index.json";
const IMAGES_DIR: &str = "images";
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
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub width: Option<u32>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub height: Option<u32>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub size: Option<u64>,
    #[serde(default, skip_serializing_if = "is_false")]
    pub is_color: bool,
}

fn is_false(value: &bool) -> bool {
    !value
}

fn clipboard_dir(app: &AppHandle) -> Result<PathBuf, String> {
    let dir = app
        .path()
        .app_data_dir()
        .map_err(|err| format!("resolve app data dir: {err}"))?
        .join(CLIP_DIR);
    fs::create_dir_all(&dir).map_err(|err| format!("create clipboard dir: {err}"))?;
    Ok(dir)
}

fn index_path(app: &AppHandle) -> Result<PathBuf, String> {
    Ok(clipboard_dir(app)?.join(INDEX_FILE))
}

pub fn images_dir(app: &AppHandle) -> Result<PathBuf, String> {
    let dir = clipboard_dir(app)?.join(IMAGES_DIR);
    fs::create_dir_all(&dir).map_err(|err| format!("create clipboard images dir: {err}"))?;
    Ok(dir)
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
    cleanup_orphan_images(&images_dir(app)?, entries);
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

pub fn discard_image(app: &AppHandle, path: &str) -> Result<(), String> {
    let resolved = resolve_image_path(app, path)?;
    if resolved.exists() {
        fs::remove_file(&resolved).map_err(|err| format!("delete clipboard image: {err}"))?;
    }
    Ok(())
}

pub fn read_image(app: &AppHandle, path: &str) -> Result<Vec<u8>, String> {
    let resolved = resolve_image_path(app, path)?;
    if !resolved.exists() {
        return Err("image not found".into());
    }
    fs::read(&resolved).map_err(|err| format!("read clipboard image: {err}"))
}

fn resolve_image_path(app: &AppHandle, path: &str) -> Result<PathBuf, String> {
    let images = images_dir(app)?;
    let Some(name) = Path::new(path).file_name() else {
        return Err("invalid image path".into());
    };
    if name == "." || name == ".." {
        return Err("invalid image path".into());
    }
    Ok(images.join(name))
}

fn image_file_name(path: &str) -> Option<String> {
    Path::new(path)
        .file_name()
        .map(|name| name.to_string_lossy().into_owned())
}

fn referenced_image_names(entries: &[ClipboardEntry]) -> HashSet<String> {
    entries
        .iter()
        .filter(|entry| entry.kind == "image")
        .filter_map(|entry| image_file_name(&entry.content))
        .collect()
}

fn cleanup_orphan_images(dir: &Path, entries: &[ClipboardEntry]) {
    let keep = referenced_image_names(entries);
    let Ok(reader) = fs::read_dir(dir) else {
        return;
    };
    for item in reader.flatten() {
        let path = item.path();
        if !path.is_file() {
            continue;
        }
        let Some(name) = path.file_name() else {
            continue;
        };
        if !keep.contains(&name.to_string_lossy().into_owned()) {
            let _ = fs::remove_file(path);
        }
    }
}

#[cfg(test)]
mod tests {
    use super::{image_file_name, referenced_image_names, ClipboardEntry};

    fn entry(kind: &str, content: &str) -> ClipboardEntry {
        ClipboardEntry {
            id: "a".into(),
            kind: kind.into(),
            content: content.into(),
            app_name: String::new(),
            created_at: 1,
            pinned: false,
            width: None,
            height: None,
            size: None,
            is_color: false,
        }
    }

    #[test]
    fn image_json_keeps_optional_dimensions() {
        let mut item = entry("image", r"C:\data\clipboard\images\abc.png");
        item.width = Some(800);
        item.height = Some(600);
        item.size = Some(12_345);
        let json = serde_json::to_string(&item).expect("serialize");
        assert!(json.contains("\"type\":\"image\""));
        assert!(json.contains("\"width\":800"));
        let parsed: ClipboardEntry = serde_json::from_str(&json).expect("deserialize");
        assert_eq!(parsed.width, Some(800));
        assert_eq!(parsed.height, Some(600));
    }

    #[test]
    fn text_entries_omit_dimension_fields() {
        let json = serde_json::to_string(&entry("text", "hello")).expect("serialize");
        assert!(!json.contains("width"));
        assert!(!json.contains("height"));
        assert!(!json.contains("isColor"));
    }

    #[test]
    fn old_entries_default_is_color_false() {
        let json = r##"{"id":"a","type":"text","content":"#ff6363","createdAt":1}"##;
        let parsed: ClipboardEntry = serde_json::from_str(json).expect("deserialize");
        assert!(!parsed.is_color);
    }

    #[test]
    fn color_flag_roundtrips() {
        let mut item = entry("text", "#ff6363");
        item.is_color = true;
        let json = serde_json::to_string(&item).expect("serialize");
        assert!(json.contains("\"isColor\":true"));
        let parsed: ClipboardEntry = serde_json::from_str(&json).expect("deserialize");
        assert!(parsed.is_color);
    }

    #[test]
    fn referenced_names_use_file_name_only() {
        let entries = vec![
            entry("image", r"C:\data\clipboard\images\abc.png"),
            entry("text", "paste me"),
            entry("image", "/tmp/clipboard/images/xyz.png"),
        ];
        let names = referenced_image_names(&entries);
        assert!(names.contains("abc.png"));
        assert!(names.contains("xyz.png"));
        assert_eq!(names.len(), 2);
        assert_eq!(image_file_name(r"D:\other\abc.png").as_deref(), Some("abc.png"));
    }
}
