use tauri::AppHandle;

use crate::storage::clipboard_store::{self, ClipboardEntry};

#[tauri::command]
pub fn get_clipboard_history(app: AppHandle) -> Result<Vec<ClipboardEntry>, String> {
    clipboard_store::load_entries(&app)
}

#[tauri::command]
pub fn save_clipboard_history(app: AppHandle, entries: Vec<ClipboardEntry>) -> Result<(), String> {
    clipboard_store::save_entries(&app, &clipboard_store::prune(entries))
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
        .filter(|entry| entry.content.to_lowercase().contains(&needle))
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
