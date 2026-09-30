use tauri::AppHandle;

use crate::storage::calc_history::{self, CalcHistoryEntry};

// Reads and parses the whole history file; off the main thread so opening the
// panel cannot stall the window, the tray or the global hotkey.
#[tauri::command(async)]
pub fn get_calc_history(app: AppHandle) -> Result<Vec<CalcHistoryEntry>, String> {
    calc_history::load_history(&app)
}

// Rewrites the whole file on every edit.
#[tauri::command(async)]
pub fn save_calc_history(app: AppHandle, entries: Vec<CalcHistoryEntry>) -> Result<(), String> {
    calc_history::save_history(&app, &entries)
}
