use tauri::AppHandle;

use crate::storage::clipboard_store::{self, ClipboardEntry};

// Reads the index, but also writes it back when it prunes, so it is not free.
#[tauri::command(async)]
pub fn get_clipboard_history(app: AppHandle) -> Result<Vec<ClipboardEntry>, String> {
    clipboard_store::load_entries(&app)
}

// Every clipboard change calls this, and it rewrites the whole (uncapped) index
// plus sweeps the image directory. On the main thread that stalls the window,
// the tray and the global hotkey, and it gets worse as history grows.
#[tauri::command(async)]
pub fn save_clipboard_history(app: AppHandle, entries: Vec<ClipboardEntry>) -> Result<(), String> {
    clipboard_store::save_entries(&app, &clipboard_store::prune(entries))
}

#[tauri::command]
pub fn get_clipboard_images_dir(app: AppHandle) -> Result<String, String> {
    clipboard_store::images_dir(&app).map(|path| path.to_string_lossy().into_owned())
}

#[tauri::command]
pub fn discard_clipboard_image(app: AppHandle, path: String) -> Result<(), String> {
    clipboard_store::discard_image(&app, &path)
}

#[tauri::command]
pub fn read_clipboard_image(app: AppHandle, path: String) -> Result<Vec<u8>, String> {
    clipboard_store::read_image(&app, &path)
}

#[tauri::command]
pub fn search_clipboard(app: AppHandle, query: String) -> Result<Vec<ClipboardEntry>, String> {
    let needle = query.trim().to_lowercase();
    let entries = clipboard_store::load_entries(&app)?;
    if needle.is_empty() {
        return Ok(entries);
    }
    Ok(entries
        .into_iter()
        .filter(|entry| matches_query(entry, &needle))
        .collect())
}

#[tauri::command]
pub fn toggle_pin_clipboard(app: AppHandle, id: String) -> Result<Vec<ClipboardEntry>, String> {
    let mut entries = clipboard_store::load_entries(&app)?;
    for entry in &mut entries {
        if entry.id == id {
            entry.pinned = !entry.pinned;
            break;
        }
    }
    clipboard_store::save_entries(&app, &entries)?;
    Ok(entries)
}

#[tauri::command]
pub fn delete_clipboard_entry(app: AppHandle, id: String) -> Result<Vec<ClipboardEntry>, String> {
    let mut entries = clipboard_store::load_entries(&app)?;
    entries.retain(|entry| entry.id != id);
    clipboard_store::save_entries(&app, &entries)?;
    Ok(entries)
}

#[tauri::command]
pub fn clear_clipboard(app: AppHandle, keep_pinned: bool) -> Result<Vec<ClipboardEntry>, String> {
    let entries = clipboard_store::load_entries(&app)?;
    let next = if keep_pinned {
        entries.into_iter().filter(|entry| entry.pinned).collect()
    } else {
        Vec::new()
    };
    clipboard_store::save_entries(&app, &next)?;
    Ok(next)
}

fn matches_query(entry: &ClipboardEntry, needle: &str) -> bool {
    if entry.kind == "image" {
        let mut hay = String::from("图片 image png");
        if let (Some(width), Some(height)) = (entry.width, entry.height) {
            hay.push_str(&format!(" {width}x{height}"));
        }
        hay.push(' ');
        hay.push_str(&entry.app_name);
        return hay.to_lowercase().contains(needle);
    }
    entry.content.to_lowercase().contains(needle)
        || entry.app_name.to_lowercase().contains(needle)
}
