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
