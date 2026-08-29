use std::collections::HashSet;
use std::fs;
use std::path::{Path, PathBuf};

use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Manager};

const CLIP_DIR: &str = "clipboard";
const INDEX_FILE: &str = "index.json";
const IMAGES_DIR: &str = "images";
const MAX_IMAGES: usize = 200;
const DAY_MS: i64 = 86_400_000;

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

    let entries: Vec<ClipboardEntry> =
        serde_json::from_str(&data).map_err(|err| format!("parse clipboard index: {err}"))?;
    let pruned = prune(entries.clone());
    if pruned.len() != entries.len() {
        let _ = save_entries(app, &pruned);
    }
    Ok(pruned)
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
    let mut texts = Vec::new();
    let mut images = Vec::new();
    for entry in entries {
        if entry.kind == "image" {
            images.push(entry);
        } else {
            texts.push(entry);
        }
    }
    if images.len() > MAX_IMAGES {
        let mut pinned: Vec<_> = images.iter().filter(|entry| entry.pinned).cloned().collect();
        let mut rest: Vec<_> = images.into_iter().filter(|entry| !entry.pinned).collect();
        pinned.sort_by(|a, b| b.created_at.cmp(&a.created_at));
        rest.sort_by(|a, b| b.created_at.cmp(&a.created_at));
        if pinned.len() > MAX_IMAGES {
            pinned.truncate(MAX_IMAGES);
            rest.clear();
        } else {
            rest.truncate(MAX_IMAGES.saturating_sub(pinned.len()));
        }
        images = pinned;
        images.append(&mut rest);
    }
    texts.append(&mut images);
    texts.sort_by(|a, b| b.created_at.cmp(&a.created_at));
    texts
}

pub fn expire(entries: Vec<ClipboardEntry>, now_ms: i64, retain_days: u32) -> Vec<ClipboardEntry> {
    let kept = if retain_days == 0 {
        entries
    } else {
        let cutoff = now_ms.saturating_sub(i64::from(retain_days).saturating_mul(DAY_MS));
        entries
            .into_iter()
            .filter(|entry| entry.kind == "image" || entry.pinned || entry.created_at >= cutoff)
            .collect()
    };
    cap_unpinned_images(kept)
}

pub fn expire_preview(entries: &[ClipboardEntry], now_ms: i64, retain_days: u32) -> (usize, usize) {
    if retain_days == 0 {
        return (0, 0);
    }
    let cutoff = now_ms.saturating_sub(i64::from(retain_days).saturating_mul(DAY_MS));
    let texts = entries
        .iter()
        .filter(|entry| entry.kind != "image" && !entry.pinned && entry.created_at < cutoff)
        .count();
    let kept: Vec<_> = entries
        .iter()
        .filter(|entry| entry.kind == "image" || entry.pinned || entry.created_at >= cutoff)
        .cloned()
        .collect();
    let before_images = kept.iter().filter(|entry| entry.kind == "image").count();
    let after_images = cap_unpinned_images(kept)
        .iter()
        .filter(|entry| entry.kind == "image")
        .count();
    (texts, before_images.saturating_sub(after_images))
}

fn cap_unpinned_images(entries: Vec<ClipboardEntry>) -> Vec<ClipboardEntry> {
    let mut texts = Vec::new();
    let mut images = Vec::new();
    for entry in entries {
        if entry.kind == "image" {
            images.push(entry);
        } else {
            texts.push(entry);
        }
    }
    if images.len() > MAX_IMAGES {
        let pinned: Vec<_> = images.iter().filter(|entry| entry.pinned).cloned().collect();
        let mut rest: Vec<_> = images.into_iter().filter(|entry| !entry.pinned).collect();
        rest.sort_by(|a, b| b.created_at.cmp(&a.created_at));
        rest.truncate(MAX_IMAGES.saturating_sub(pinned.len()));
        images = pinned;
        images.append(&mut rest);
    }
    texts.append(&mut images);
    texts.sort_by(|a, b| b.created_at.cmp(&a.created_at));
    texts
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

    #[test]
    fn prune_keeps_unlimited_text_and_caps_images() {
        let mut entries = Vec::new();
        for i in 0..30 {
            let mut item = entry("text", &format!("t{i}"));
            item.id = format!("t{i}");
            item.created_at = i;
            entries.push(item);
        }
        for i in 0..210 {
            let mut item = entry("image", &format!("img{i}.png"));
            item.id = format!("i{i}");
            item.created_at = 1000 + i;
            entries.push(item);
        }
        let pruned = super::prune(entries);
        let texts = pruned.iter().filter(|e| e.kind == "text").count();
        let images = pruned.iter().filter(|e| e.kind == "image").count();
        assert_eq!(texts, 30);
        assert_eq!(images, 200);
        let newest_image = pruned
            .iter()
            .filter(|e| e.kind == "image")
            .map(|e| e.created_at)
            .max()
            .unwrap();
        let oldest_kept = pruned
            .iter()
            .filter(|e| e.kind == "image")
            .map(|e| e.created_at)
            .min()
            .unwrap();
        assert_eq!(newest_image, 1000 + 209);
        assert_eq!(oldest_kept, 1000 + 10);
    }

    #[test]
    fn prune_drops_unpinned_images_before_pinned() {
        let mut entries = Vec::new();
        for i in 0..50 {
            let mut item = entry("image", &format!("pin{i}.png"));
            item.id = format!("p{i}");
            item.created_at = i;
            item.pinned = true;
            entries.push(item);
        }
        for i in 0..200 {
            let mut item = entry("image", &format!("old{i}.png"));
            item.id = format!("u{i}");
            item.created_at = 100 + i;
            entries.push(item);
        }
        let pruned = super::prune(entries);
        let images: Vec<_> = pruned.into_iter().filter(|e| e.kind == "image").collect();
        assert_eq!(images.len(), 200);
        assert_eq!(images.iter().filter(|e| e.pinned).count(), 50);
        assert_eq!(images.iter().filter(|e| !e.pinned).count(), 150);
    }

    #[test]
    fn expire_drops_old_unpinned_text_and_keeps_pinned() {
        let now = 10 * 86_400_000;
        let mut old = entry("text", "old");
        old.id = "old".into();
        old.created_at = 0;
        let mut pinned = entry("text", "keep");
        pinned.id = "pin".into();
        pinned.created_at = 0;
        pinned.pinned = true;
        let mut fresh = entry("text", "fresh");
        fresh.id = "fresh".into();
        fresh.created_at = now;
        let pruned = super::expire(vec![old, pinned, fresh], now, 7);
        let texts: Vec<_> = pruned.into_iter().map(|e| e.id).collect();
        assert_eq!(texts, vec!["fresh".to_string(), "pin".to_string()]);
    }

    #[test]
    fn expire_preview_counts_old_text_and_excess_unpinned_images() {
        let now = 10 * 86_400_000;
        let mut entries = Vec::new();
        for i in 0..3 {
            let mut item = entry("text", &format!("old{i}"));
            item.id = format!("t{i}");
            item.created_at = 0;
            entries.push(item);
        }
        for i in 0..205 {
            let mut item = entry("image", &format!("img{i}.png"));
            item.id = format!("i{i}");
            item.created_at = now;
            entries.push(item);
        }
        let (texts, images) = super::expire_preview(&entries, now, 7);
        assert_eq!(texts, 3);
        assert_eq!(images, 5);
    }

    #[test]
    fn expire_never_when_retention_is_zero() {
        let mut old = entry("text", "old");
        old.created_at = 0;
        let (texts, images) = super::expire_preview(&[old.clone()], 10 * 86_400_000, 0);
        assert_eq!((texts, images), (0, 0));
        let kept = super::expire(vec![old], 10 * 86_400_000, 0);
        assert_eq!(kept.len(), 1);
    }
}
