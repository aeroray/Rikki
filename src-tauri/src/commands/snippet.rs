use tauri::AppHandle;

use crate::storage::snippet_store::{self, Snippet};

#[tauri::command(async)]
pub fn get_snippets(app: AppHandle) -> Result<Vec<Snippet>, String> {
    snippet_store::load_snippets(&app)
}

// Every mutating command below rewrites snippets.json through a temp file and a
// rename. Inline on the main thread that write stalls the window, the tray and
// the global hotkey for as long as the disk takes.
#[tauri::command(async)]
pub fn create_snippet(
    app: AppHandle,
    title: String,
    content: String,
    keyword: Option<String>,
    sensitive: Option<bool>,
) -> Result<Snippet, String> {
    snippet_store::create_snippet(&app, title, content, keyword, sensitive)
}

#[tauri::command(async)]
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

#[tauri::command(async)]
pub fn delete_snippet(app: AppHandle, id: String) -> Result<(), String> {
    snippet_store::delete_snippet(&app, &id)
}
