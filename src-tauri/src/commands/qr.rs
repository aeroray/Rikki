use tauri::{AppHandle, Manager};
use tauri_plugin_dialog::DialogExt;

#[tauri::command]
pub async fn save_png_file(app: AppHandle, bytes: Vec<u8>, default_name: String) -> Result<bool, String> {
    crate::set_ignore_blur(&app, true);
    let result = save_png_inner(app.clone(), bytes, default_name).await;
    crate::set_ignore_blur(&app, false);
    if !matches!(result, Ok(true)) {
        if let Some(window) = app.get_webview_window("main") {
            let _ = window.set_focus();
        }
    }
    result
}

async fn save_png_inner(app: AppHandle, bytes: Vec<u8>, default_name: String) -> Result<bool, String> {
    let name = if default_name.trim().is_empty() {
        "qr.png".to_string()
    } else {
        default_name
    };
    let picked = tauri::async_runtime::spawn_blocking(move || {
        app.dialog()
            .file()
            .add_filter("PNG", &["png"])
            .set_file_name(&name)
            .blocking_save_file()
    })
    .await
    .map_err(|err| err.to_string())?;

    let Some(file) = picked else {
        return Ok(false);
    };
    let path = file.into_path().map_err(|err| err.to_string())?;
    std::fs::write(&path, bytes).map_err(|err| format!("write png: {err}"))?;
    Ok(true)
}
