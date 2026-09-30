use tauri::AppHandle;

use crate::storage::settings_store::{self, Settings};

#[tauri::command(async)]
pub fn get_settings(app: AppHandle) -> Result<Settings, String> {
    settings_store::load_settings(&app)
}

// Each of these rewrites settings.json through a temp file and a rename, and the
// hotkey path also unregisters and re-registers the global shortcut. Both are
// slow enough to stall the window, the tray and the hotkey itself when they run
// inline on the main thread.
#[tauri::command(async)]
pub fn update_setting(app: AppHandle, key: String, value: String) -> Result<Settings, String> {
    if key == "hotkey" {
        return crate::apply_hotkey(&app, &value);
    }
    settings_store::update_setting(&app, &key, &value)
}

#[tauri::command(async)]
pub fn add_custom_engine(app: AppHandle, name: String, url: String) -> Result<Settings, String> {
    settings_store::add_custom_engine(&app, name, url)
}

#[tauri::command(async)]
pub fn delete_custom_engine(app: AppHandle, id: String) -> Result<Settings, String> {
    settings_store::delete_custom_engine(&app, &id)
}

#[tauri::command]
pub fn begin_hotkey_capture(app: AppHandle) -> Result<(), String> {
    crate::start_hotkey_capture(&app)
}

#[tauri::command]
pub fn cancel_hotkey_capture(app: AppHandle) -> Result<(), String> {
    crate::restore_hotkey_capture(&app);
    Ok(())
}

#[tauri::command]
pub fn update_tray_menu(app: AppHandle, show: String, quit: String) -> Result<(), String> {
    #[cfg(desktop)]
    {
        crate::tray::set_labels(&app, &show, &quit)
    }
    #[cfg(not(desktop))]
    {
        let _ = (app, show, quit);
        Ok(())
    }
}
