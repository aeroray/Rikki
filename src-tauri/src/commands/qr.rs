use tauri::AppHandle;
use tauri_plugin_dialog::DialogExt;

#[tauri::command]
pub async fn save_png_file(app: AppHandle, bytes: Vec<u8>, default_name: String) -> Result<bool, String> {
    // The guard holds the palette off the dialog for as long as it is open, and
    // puts it back — visible, focused and topmost — however this returns.
    let _native = crate::begin_native_dialog(&app);
    let name = sanitize_file_name(&default_name);
    let picked = tauri::async_runtime::spawn_blocking({
        let app = app.clone();
        move || {
            app.dialog()
                .file()
                .add_filter("PNG", &["png"])
                .set_file_name(&name)
                .blocking_save_file()
        }
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

/// Keeps the suggested name inside the directory the dialog opens in.
fn sanitize_file_name(raw: &str) -> String {
    let name = std::path::Path::new(raw.trim())
        .file_name()
        .map(|name| name.to_string_lossy().into_owned())
        .unwrap_or_default();
    if name.is_empty() || name == "." || name == ".." {
        "qr.png".to_string()
    } else if name.to_ascii_lowercase().ends_with(".png") {
        name
    } else {
        format!("{name}.png")
    }
}
