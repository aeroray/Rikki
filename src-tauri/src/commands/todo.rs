use tauri::AppHandle;

use crate::storage::todo_store::{self, Todo};

// Reads and parses the whole todo file; off the main thread so opening the panel
// cannot stall the window, the tray or the global hotkey.
#[tauri::command(async)]
pub fn get_todos(app: AppHandle) -> Result<Vec<Todo>, String> {
    todo_store::load_todos(&app)
}

// Rewrites the whole file on every edit.
#[tauri::command(async)]
pub fn save_todos(app: AppHandle, todos: Vec<Todo>) -> Result<(), String> {
    todo_store::save_todos(&app, &todos)
}
