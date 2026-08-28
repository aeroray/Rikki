use std::path::Path;
use std::time::Duration;

use active_win_pos_rs::get_active_window;
use enigo::{
    Direction::{Click, Press, Release},
    Enigo, Key, Keyboard, Settings,
};

#[tauri::command]
pub fn simulate_paste() -> Result<(), String> {
    std::thread::sleep(Duration::from_millis(220));
    let mut enigo = Enigo::new(&Settings::default()).map_err(|err| err.to_string())?;

    #[cfg(target_os = "macos")]
    let modifier = Key::Meta;
    #[cfg(not(target_os = "macos"))]
    let modifier = Key::Control;

    enigo
        .key(modifier, Press)
        .map_err(|err| err.to_string())?;
    enigo
        .key(Key::Unicode('v'), Click)
        .map_err(|err| err.to_string())?;
    enigo
        .key(modifier, Release)
        .map_err(|err| err.to_string())?;
    Ok(())
}

#[tauri::command]
pub fn get_foreground_app() -> String {
    foreground_app_name()
}

fn foreground_app_name() -> String {
    let Ok(window) = get_active_window() else {
        return String::new();
    };
    if window.process_id == u64::from(std::process::id()) {
        return String::new();
    }
    display_app_name(&window.app_name, &window.process_path)
}

fn display_app_name(raw: &str, path: &Path) -> String {
    let trimmed = raw.trim();
    if is_self_app(trimmed) {
        return String::new();
    }
    if !trimmed.is_empty() {
        return trimmed.to_string();
    }
    path.file_stem()
        .map(|name| name.to_string_lossy().into_owned())
        .filter(|name| !is_self_app(name))
        .unwrap_or_default()
}

fn is_self_app(name: &str) -> bool {
    name.eq_ignore_ascii_case("rikki")
}

#[cfg(test)]
mod tests {
    use super::{display_app_name, is_self_app};
    use std::path::Path;

    #[test]
    fn skips_rikki_and_prefers_app_name() {
        assert!(is_self_app("Rikki"));
        assert_eq!(
            display_app_name("Google Chrome", Path::new(r"C:\Program Files\Google\Chrome\chrome.exe")),
            "Google Chrome"
        );
        assert_eq!(
            display_app_name("rikki", Path::new(r"D:\Develop\Rikki\rikki.exe")),
            ""
        );
        assert_eq!(
            display_app_name("", Path::new(r"C:\Apps\Code.exe")),
            "Code"
        );
    }
}
