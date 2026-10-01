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
        // Windows and Linux expect a tray left click to *do* something, so the
        // menu is moved to the right button and the left one opens the palette.
        // macOS is the other way round: a menu-bar icon's left click opens its
        // menu, and that menu is the only place Quit lives, so taking the click
        // for the palette would leave the menu on a right click — not the
        // platform's convention, and the wrong way to reach Quit.
        .show_menu_on_left_click(cfg!(target_os = "macos"))
        .tooltip(tooltip())
        .on_menu_event(|app, event| {
            // A native popup menu can leave the ShowCursor counter below zero,
            // which keeps the cursor invisible until the process exits. Repair
            // it as soon as the menu reports a selection, before doing anything
            // that might take time.
            crate::cursor::ensure_cursor_visible();
            match event.id.as_ref() {
                "tray-show" => show_palette(app),
                "tray-quit" => app.exit(0),
                _ => {}
            }
        })
        .on_tray_icon_event(|tray, event| {
            if let TrayIconEvent::Click {
                button: MouseButton::Right,
                button_state: MouseButtonState::Up,
                ..
            } = event
            {
                // The right-click is about to open the native menu, which can
                // leave the ShowCursor counter negative. Sweep the cursor back
                // over the next moment: a menu dismissed without a selection
                // never fires `on_menu_event`, so this is the only repair that
                // covers that case.
                crate::cursor::repair_cursor_soon(tray.app_handle());
            }

            if let TrayIconEvent::Click {
                button: MouseButton::Left,
                button_state: MouseButtonState::Up,
                ..
            } = event
            {
                // On macOS a menu-bar icon opens its menu on a left click, and the
                // menu is the only way to reach Quit there — a left click that
                // instead summoned the palette would leave the menu unreachable
                // without a right click, which is not the platform's convention.
                // Windows and Linux keep the left-click-to-show behaviour, which
                // is what they expect.
                #[cfg(not(target_os = "macos"))]
                show_palette(tray.app_handle());
                #[cfg(target_os = "macos")]
                let _ = tray;
            }
        });

    // The transparent mark, not the app icon.
    //
    // The app icon is the raccoon on a near-black tile, and a black tile on a dark
    // taskbar is invisible: the tray showed a small purple face floating in the bar
    // while every icon beside it filled its box. Measured against the neighbours,
    // both were exactly 16px tall — it was never the size, it was the tile
    // disappearing into the background. The mark has no tile, so it reads in both
    // themes. `icons/tray.png` is derived from `design/brand/mark.png`; the brand
    // README says how.
    builder = builder.icon(tauri::image::Image::from_bytes(include_bytes!(
        "../icons/tray.png"
    ))?);

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

/// Points the tooltip at the hotkey that is actually registered.
///
/// It used to be hardcoded to the default at install time, so after the user
/// changed the shortcut the tray kept advertising the old one. An empty hotkey
/// means there is none, and the tooltip then drops the shortcut rather than
/// naming one that does nothing.
pub fn set_tooltip(app: &AppHandle, hotkey: &str) -> Result<(), String> {
    let tray = app
        .tray_by_id("main")
        .ok_or_else(|| "tray icon missing".to_string())?;
    tray.set_tooltip(Some(tooltip_text(hotkey)))
        .map_err(|err| format!("set tray tooltip: {err}"))
}

fn tooltip_text(hotkey: &str) -> String {
    let label = hotkey_label(hotkey);
    if label.is_empty() {
        "Rikki".to_string()
    } else {
        format!("Rikki — {label}")
    }
}

fn hotkey_label(hotkey: &str) -> String {
    let trimmed = hotkey.trim();
    if trimmed.is_empty() {
        return String::new();
    }
    #[cfg(target_os = "macos")]
    {
        // macOS convention writes modifiers as glyphs with no separators.
        return trimmed
            .replace("Command", "⌘")
            .replace("Control", "⌃")
            .replace("Alt", "⌥")
            .replace("Shift", "⇧")
            .replace('+', "");
    }
    #[cfg(not(target_os = "macos"))]
    {
        trimmed.to_string()
    }
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

#[cfg(test)]
mod tests {
    use super::tooltip_text;

    /// The tooltip has to name the key that is registered, and name none at all
    /// when there is none: a shortcut that does nothing is the one thing it
    /// must not advertise.
    #[test]
    fn the_tooltip_drops_a_shortcut_that_is_not_registered() {
        assert_eq!(tooltip_text(""), "Rikki");
        assert_eq!(tooltip_text("   "), "Rikki");
    }

    #[test]
    fn the_tooltip_names_the_registered_shortcut() {
        let text = tooltip_text("Alt+Space");
        assert!(text.starts_with("Rikki — "), "{text}");
        assert!(text.contains("Space"), "{text}");
    }
}
