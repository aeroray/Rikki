use tauri::AppHandle;

use crate::storage::todo_store::{self, Todo};

#[tauri::command]
pub fn get_todos(app: AppHandle) -> Result<Vec<Todo>, String> {
    todo_store::load_todos(&app)
}

// Rewrites the whole file on every edit.
#[tauri::command(async)]
pub fn save_todos(app: AppHandle, todos: Vec<Todo>) -> Result<(), String> {
    todo_store::save_todos(&app, &todos)
}
