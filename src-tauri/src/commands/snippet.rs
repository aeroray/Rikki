use tauri::AppHandle;

use crate::storage::snippet_store::{self, Snippet};

#[tauri::command]
pub fn get_snippets(app: AppHandle) -> Result<Vec<Snippet>, String> {
    snippet_store::load_snippets(&app)
}

#[tauri::command]
pub fn create_snippet(
    app: AppHandle,
    title: String,
    content: String,
    keyword: Option<String>,
    sensitive: Option<bool>,
) -> Result<Snippet, String> {
    snippet_store::create_snippet(&app, title, content, keyword, sensitive)
}

#[tauri::command]
pub fn update_snippet(
    app: AppHandle,
    id: String,
    title: String,
    content: String,
    keyword: Option<String>,
    sensitive: Option<bool>,
) -> Result<Snippet, String> {
    snippet_store::update_snippet(&app, &id, title, content, keyword, sensitive)
}

#[tauri::command]
pub fn delete_snippet(app: AppHandle, id: String) -> Result<(), String> {
    snippet_store::delete_snippet(&app, &id)
}
