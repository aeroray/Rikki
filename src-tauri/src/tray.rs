use tauri::menu::{Menu, MenuItem, PredefinedMenuItem};
use tauri::tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent};
use tauri::AppHandle;

use crate::show_palette;

pub fn install(app: &AppHandle) -> tauri::Result<()> {
    let show = MenuItem::with_id(app, "tray-show", "打开", true, None::<&str>)?;
    let quit = MenuItem::with_id(app, "tray-quit", "退出", true, None::<&str>)?;
    let separator = PredefinedMenuItem::separator(app)?;
    let menu = Menu::with_items(app, &[&show, &separator, &quit])?;

    let mut builder = TrayIconBuilder::with_id("main")
        .menu(&menu)
        .show_menu_on_left_click(false)
        .tooltip(tooltip())
        .on_menu_event(|app, event| match event.id.as_ref() {
            "tray-show" => show_palette(app),
            "tray-quit" => app.exit(0),
            _ => {}
        })
        .on_tray_icon_event(|tray, event| {
            if let TrayIconEvent::Click {
                button: MouseButton::Left,
                button_state: MouseButtonState::Up,
                ..
            } = event
            {
                show_palette(tray.app_handle());
            }
        });

    if let Some(icon) = app.default_window_icon() {
        builder = builder.icon(icon.clone());
    }

    builder.build(app)?;
    Ok(())
}

pub fn set_labels(app: &AppHandle, show_label: &str, quit_label: &str) -> Result<(), String> {
    let tray = app
        .tray_by_id("main")
        .ok_or_else(|| "tray icon missing".to_string())?;
    let show = MenuItem::with_id(app, "tray-show", show_label, true, None::<&str>)
        .map_err(|err| format!("tray show item: {err}"))?;
    let quit = MenuItem::with_id(app, "tray-quit", quit_label, true, None::<&str>)
        .map_err(|err| format!("tray quit item: {err}"))?;
    let separator =
        PredefinedMenuItem::separator(app).map_err(|err| format!("tray separator: {err}"))?;
    let menu = Menu::with_items(app, &[&show, &separator, &quit])
        .map_err(|err| format!("tray menu: {err}"))?;
    tray.set_menu(Some(menu))
        .map_err(|err| format!("set tray menu: {err}"))?;
    Ok(())
}

fn tooltip() -> &'static str {
    #[cfg(target_os = "macos")]
    {
        "Rikki — ⌘K"
    }
    #[cfg(not(target_os = "macos"))]
    {
        "Rikki — Alt+Space"
    }
}
