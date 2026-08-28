use std::sync::Mutex;
use std::time::{Duration, Instant};

use tauri::{Emitter, Manager, WebviewWindow};
use tauri_plugin_global_shortcut::{GlobalShortcutExt, ShortcutState};

mod commands;
mod input;
mod storage;
#[cfg(desktop)]
mod tray;

use commands::calc::{get_calc_history, save_calc_history};
use commands::clipboard::{
    clear_clipboard, delete_clipboard_entry, discard_clipboard_image, get_clipboard_history,
    get_clipboard_images_dir, save_clipboard_history, search_clipboard, toggle_pin_clipboard,
};
use commands::todo::{get_todos, save_todos};
use input::{get_foreground_app, simulate_paste};

const PALETTE_LABEL: &str = "main";
const BLUR_GRACE: Duration = Duration::from_millis(220);

struct HideGate {
    hiding: bool,
    seq: u64,
}

struct PaletteState {
    last_shown_at: Mutex<Option<Instant>>,
    hide: Mutex<HideGate>,
}

fn palette_window(app: &tauri::AppHandle) -> Option<WebviewWindow> {
    app.get_webview_window(PALETTE_LABEL)
}

fn mark_shown(app: &tauri::AppHandle) {
    if let Some(state) = app.try_state::<PaletteState>() {
        *state.last_shown_at.lock().expect("palette state") = Some(Instant::now());
    }
}

fn should_hide_on_blur(app: &tauri::AppHandle) -> bool {
    let Some(state) = app.try_state::<PaletteState>() else {
        return true;
    };
    let shown_at = *state.last_shown_at.lock().expect("palette state");
    match shown_at {
        Some(shown_at) => shown_at.elapsed() >= BLUR_GRACE,
        None => true,
    }
}

fn bump_hide_seq(app: &tauri::AppHandle, hiding: bool) {
    if let Some(state) = app.try_state::<PaletteState>() {
        let mut hide = state.hide.lock().expect("palette state");
        hide.hiding = hiding;
        hide.seq = hide.seq.wrapping_add(1);
    }
}

fn hide_palette(app: &tauri::AppHandle) {
    if let Some(window) = palette_window(app) {
        let _ = window.hide();
    }
    bump_hide_seq(app, false);
}

fn request_hide(app: &tauri::AppHandle) {
    let Some(window) = palette_window(app) else {
        return;
    };
    let seq = if let Some(state) = app.try_state::<PaletteState>() {
        let mut hide = state.hide.lock().expect("palette state");
        if hide.hiding {
            return;
        }
        hide.hiding = true;
        hide.seq = hide.seq.wrapping_add(1);
        hide.seq
    } else {
        0
    };
    let _ = window.emit("palette-request-hide", ());
    let window = window.clone();
    let app = app.clone();
    std::thread::spawn(move || {
        std::thread::sleep(Duration::from_millis(140));
        let still = app.try_state::<PaletteState>().is_some_and(|state| {
            let hide = state.hide.lock().expect("palette state");
            hide.hiding && hide.seq == seq
        });
        if still {
            let _ = window.hide();
            bump_hide_seq(&app, false);
        }
    });
}

pub(crate) fn show_palette(app: &tauri::AppHandle) {
    let Some(window) = palette_window(app) else {
        return;
    };
    mark_shown(app);
    bump_hide_seq(app, false);
    let _ = window.center();
    let _ = window.show();
    let _ = window.set_focus();
    let _ = window.emit("palette-shown", ());
}

fn is_hiding(app: &tauri::AppHandle) -> bool {
    app.try_state::<PaletteState>()
        .is_some_and(|state| state.hide.lock().expect("palette state").hiding)
}

fn toggle_palette(app: &tauri::AppHandle) {
    let Some(window) = palette_window(app) else {
        return;
    };
    if is_hiding(app) {
        show_palette(app);
        return;
    }
    if window.is_visible().unwrap_or(false) {
        request_hide(app);
    } else {
        show_palette(app);
    }
}

#[tauri::command]
fn hide_window(app: tauri::AppHandle) {
    hide_palette(&app);
}

#[tauri::command]
fn request_hide_window(app: tauri::AppHandle) {
    request_hide(&app);
}

fn apply_platform_window(window: &WebviewWindow) {
    let _ = window.set_decorations(false);
    #[cfg(target_os = "windows")]
    {
        let _ = window.set_shadow(false);
    }
    #[cfg(target_os = "macos")]
    {
        let _ = window.set_shadow(true);
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .manage(PaletteState {
            last_shown_at: Mutex::new(None),
            hide: Mutex::new(HideGate {
                hiding: false,
                seq: 0,
            }),
        })
        .plugin(tauri_plugin_clipboard_x::init())
        .plugin(
            tauri_plugin_global_shortcut::Builder::new()
                .with_handler(|app, _shortcut, event| {
                    if event.state == ShortcutState::Pressed {
                        toggle_palette(app);
                    }
                })
                .build(),
        )
        .setup(|app| {
            #[cfg(desktop)]
            {
                #[cfg(target_os = "macos")]
                let shortcut = "Command+K";
                #[cfg(not(target_os = "macos"))]
                let shortcut = "Alt+Space";

                app.global_shortcut().register(shortcut)?;
            }

            #[cfg(desktop)]
            tray::install(app.handle())?;

            if let Some(window) = palette_window(app.handle()) {
                apply_platform_window(&window);
                let handle = app.handle().clone();
                window.on_window_event(move |event| {
                    if let tauri::WindowEvent::Focused(false) = event {
                        if should_hide_on_blur(&handle) {
                            request_hide(&handle);
                        }
                    }
                });
            }

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            hide_window,
            request_hide_window,
            get_todos,
            save_todos,
            get_calc_history,
            save_calc_history,
            get_clipboard_history,
            save_clipboard_history,
            get_clipboard_images_dir,
            discard_clipboard_image,
            search_clipboard,
            toggle_pin_clipboard,
            delete_clipboard_entry,
            clear_clipboard,
            simulate_paste,
            get_foreground_app
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
