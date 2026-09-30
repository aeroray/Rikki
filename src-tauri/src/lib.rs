use std::sync::Mutex;
use std::time::{Duration, Instant};

use tauri::{Emitter, Manager, WebviewWindow};
use tauri_plugin_global_shortcut::{GlobalShortcutExt, ShortcutState};

mod apps;
mod apps_icons;
mod commands;
mod cursor;
mod input;
mod storage;
#[cfg(desktop)]
mod tray;

use commands::anniversary::{
    create_anniversary, delete_anniversary, get_anniversaries, update_anniversary,
};
use commands::apps::{bump_usage, get_installed_apps, get_usage_counts, launch_app, AppIndex};
use commands::backup::{export_backup, import_backup};
use commands::calc::{get_calc_history, save_calc_history};
use commands::qr::save_png_file;
use commands::settings::{
    add_custom_engine, begin_hotkey_capture, cancel_hotkey_capture, delete_custom_engine,
    get_settings, update_setting, update_tray_menu,
};
use commands::translate::translate;
use storage::settings_store;
use commands::snippet::{create_snippet, delete_snippet, get_snippets, update_snippet};
use commands::system::lock_screen;
use commands::clipboard::{
    discard_clipboard_image, get_clipboard_history, get_clipboard_images_dir,
    read_clipboard_image, save_clipboard_history,
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
    hotkey: Mutex<String>,
    capturing_hotkey: Mutex<bool>,
    ignore_blur: Mutex<bool>,
}

/// Takes a lock, recovering the value if a previous holder panicked.
///
/// `.expect()` turns one panic while a lock is held into a panic in every later
/// lock of the same mutex. These mutexes are touched from the tray and hotkey
/// threads as well as the main one, so poisoning would take the whole app down
/// rather than degrade one operation.
fn lock<T>(mutex: &Mutex<T>) -> std::sync::MutexGuard<'_, T> {
    mutex.lock().unwrap_or_else(|poisoned| poisoned.into_inner())
}

fn palette_window(app: &tauri::AppHandle) -> Option<WebviewWindow> {
    app.get_webview_window(PALETTE_LABEL)
}

fn mark_shown(app: &tauri::AppHandle) {
    if let Some(state) = app.try_state::<PaletteState>() {
        *lock(&state.last_shown_at) = Some(Instant::now());
    }
}

fn should_hide_on_blur(app: &tauri::AppHandle) -> bool {
    let Some(state) = app.try_state::<PaletteState>() else {
        return true;
    };
    if *lock(&state.ignore_blur) {
        return false;
    }
    let shown_at = *lock(&state.last_shown_at);
    match shown_at {
        Some(shown_at) => shown_at.elapsed() >= BLUR_GRACE,
        None => true,
    }
}

pub(crate) fn set_ignore_blur(app: &tauri::AppHandle, ignore: bool) {
    if let Some(state) = app.try_state::<PaletteState>() {
        *lock(&state.ignore_blur) = ignore;
    }
}

fn bump_hide_seq(app: &tauri::AppHandle, hiding: bool) {
    if let Some(state) = app.try_state::<PaletteState>() {
        let mut hide = lock(&state.hide);
        hide.hiding = hiding;
        hide.seq = hide.seq.wrapping_add(1);
    }
}

fn request_hide(app: &tauri::AppHandle) {
    restore_hotkey_capture(app);
    let Some(window) = palette_window(app) else {
        return;
    };
    let seq = if let Some(state) = app.try_state::<PaletteState>() {
        let mut hide = lock(&state.hide);
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
            let hide = lock(&state.hide);
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
    // The tray menu is a native popup that can leave the ShowCursor counter
    // negative, which hides the cursor until the process exits. Showing the
    // palette is the first thing that happens after the menu closes, so the
    // repair belongs here as well as on the menu event itself.
    cursor::ensure_cursor_visible();
    mark_shown(app);
    bump_hide_seq(app, false);
    let _ = window.center();
    let _ = window.show();
    let _ = window.set_focus();
    let _ = window.emit("palette-shown", ());
}

fn is_hiding(app: &tauri::AppHandle) -> bool {
    app.try_state::<PaletteState>()
        .is_some_and(|state| lock(&state.hide).hiding)
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
fn request_hide_window(app: tauri::AppHandle) {
    request_hide(&app);
}

fn has_hotkey_modifier(shortcut: &str) -> bool {
    let lower = shortcut.to_ascii_lowercase();
    lower.contains("control")
        || lower.contains("ctrl")
        || lower.contains("alt")
        || lower.contains("option")
        || lower.contains("command")
        || lower.contains("cmd")
        || lower.contains("super")
        || lower.contains("meta")
}

pub(crate) fn start_hotkey_capture(app: &tauri::AppHandle) -> Result<(), String> {
    let Some(state) = app.try_state::<PaletteState>() else {
        return Ok(());
    };
    let mut capturing = lock(&state.capturing_hotkey);
    if *capturing {
        return Ok(());
    }
    let hotkey = lock(&state.hotkey).clone();
    if !hotkey.is_empty() {
        // Not fatal: the flag still goes up, so the recorder owns the keyboard
        // either way. It used to be discarded silently, which is one of the two
        // ways the app could end up believing a shortcut was free when it was
        // not.
        if let Err(err) = app.global_shortcut().unregister(hotkey.as_str()) {
            eprintln!("rikki: could not release the hotkey for capture: {err}");
        }
    }
    *capturing = true;
    Ok(())
}

/// Re-registers the shortcut after a capture was interrupted.
///
/// The actual work is deferred to another thread on purpose. The
/// global-shortcut plugin holds its own mutex for the whole duration of the
/// callback it invokes, and `register`/`unregister` take that same mutex.
/// `std::sync::Mutex` is not reentrant, so calling either from inside the
/// handler — which is how this is reached, through `request_hide` from
/// `toggle_palette` — deadlocks the main thread and freezes the entire app.
///
/// The hop has to go through a *different* thread first: `run_on_main_thread`
/// runs its closure inline when the caller is already on the main thread, which
/// is precisely the case being avoided here.
pub(crate) fn restore_hotkey_capture(app: &tauri::AppHandle) {
    let Some(state) = app.try_state::<PaletteState>() else {
        return;
    };
    if !*lock(&state.capturing_hotkey) {
        return;
    }
    let handle = app.clone();
    std::thread::spawn(move || {
        let inner = handle.clone();
        let _ = handle.run_on_main_thread(move || restore_hotkey_capture_now(&inner));
    });
}

fn restore_hotkey_capture_now(app: &tauri::AppHandle) {
    let Some(state) = app.try_state::<PaletteState>() else {
        return;
    };
    {
        let mut capturing = lock(&state.capturing_hotkey);
        if !*capturing {
            return;
        }
        *capturing = false;
    }
    let hotkey = lock(&state.hotkey).clone();
    if !hotkey.is_empty() {
        let _ = app.global_shortcut().register(hotkey.as_str());
    }
    // The recorder may still be on screen. It was stopped by the same blur that
    // got us here, but the frontend has no way to observe that, so it would keep
    // saying "press the new shortcut" while the old one is live again — and
    // pressing that old shortcut is then swallowed by the global hotkey and
    // toggles the palette instead of being recorded.
    let _ = app.emit("hotkey-capture-cancelled", ());
}

pub(crate) fn apply_hotkey(app: &tauri::AppHandle, next: &str) -> Result<settings_store::Settings, String> {
    let next = next.trim();
    if next.is_empty() {
        return Err("hotkey is empty".into());
    }
    if !has_hotkey_modifier(next) {
        return Err("hotkey needs Control, Alt, or Command".into());
    }

    let Some(state) = app.try_state::<PaletteState>() else {
        return settings_store::update_setting(app, "hotkey", next);
    };
    let old = lock(&state.hotkey).clone();
    let capturing = *lock(&state.capturing_hotkey);
    let gs = app.global_shortcut();

    if !capturing && old == next {
        return settings_store::update_setting(app, "hotkey", next);
    }

    if !capturing && !old.is_empty() {
        let _ = gs.unregister(old.as_str());
    }

    if let Err(err) = gs.register(next) {
        if !old.is_empty() {
            // If the rollback fails too there is no hotkey at all, while the
            // stored value still says `old` — the settings screen would advertise
            // a shortcut that does nothing. Say so rather than discarding it.
            if let Err(rollback) = gs.register(old.as_str()) {
                eprintln!("rikki: could not restore the previous hotkey ({old}): {rollback}");
            }
        }
        *lock(&state.capturing_hotkey) = false;
        return Err(format!("register hotkey: {err}"));
    }

    *lock(&state.hotkey) = next.to_string();
    *lock(&state.capturing_hotkey) = false;
    let _ = tray::set_tooltip(app, next);

    match settings_store::update_setting(app, "hotkey", next) {
        Ok(settings) => Ok(settings),
        Err(err) => {
            let _ = gs.unregister(next);
            if !old.is_empty() {
                let _ = gs.register(old.as_str());
                *lock(&state.hotkey) = old;
            }
            Err(err)
        }
    }
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
        .manage(AppIndex::default())
        .manage(PaletteState {
            last_shown_at: Mutex::new(None),
            hide: Mutex::new(HideGate {
                hiding: false,
                seq: 0,
            }),
            hotkey: Mutex::new(String::new()),
            capturing_hotkey: Mutex::new(false),
            ignore_blur: Mutex::new(false),
        })
        .plugin(tauri_plugin_clipboard_x::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_power_manager::init())
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
            let registered_hotkey = {
                let hotkey = settings_store::load_settings(app.handle())
                    .map(|settings| settings_store::resolved_hotkey(&settings))
                    .unwrap_or_else(|_| settings_store::default_hotkey().to_string());
                let registered = if app.global_shortcut().register(hotkey.as_str()).is_ok() {
                    hotkey
                } else {
                    // The configured key is taken (PowerToys, an IME, another
                    // launcher). Try the default, and if that is taken too start
                    // with no hotkey rather than refusing to launch: the tray
                    // icon is still an entry point, whereas the old `?` here
                    // panicked the process with no window, no tray and no way to
                    // change the setting back.
                    let fallback = settings_store::default_hotkey();
                    if app.global_shortcut().register(fallback).is_ok() {
                        // Persist it. The stored value still names the key that
                        // failed, so the settings screen would otherwise show a
                        // shortcut that is not the one actually in effect.
                        let _ = settings_store::update_setting(app.handle(), "hotkey", fallback);
                        fallback.to_string()
                    } else {
                        eprintln!("rikki: no global hotkey available; use the tray icon");
                        String::new()
                    }
                };
                if let Some(state) = app.try_state::<PaletteState>() {
                    *lock(&state.hotkey) = registered.clone();
                }
                registered
            };

            #[cfg(desktop)]
            tray::install(app.handle())?;

            #[cfg(desktop)]
            if !registered_hotkey.is_empty() {
                let _ = tray::set_tooltip(app.handle(), &registered_hotkey);
            }

            let handle = app.handle().clone();
            std::thread::spawn(move || {
                let _ = commands::apps::warm(&handle);
            });

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
            request_hide_window,
            get_todos,
            save_todos,
            get_anniversaries,
            create_anniversary,
            update_anniversary,
            delete_anniversary,
            get_calc_history,
            save_calc_history,
            get_clipboard_history,
            save_clipboard_history,
            get_clipboard_images_dir,
            discard_clipboard_image,
            read_clipboard_image,
            simulate_paste,
            get_foreground_app,
            get_installed_apps,
            launch_app,
            get_usage_counts,
            bump_usage,
            lock_screen,
            get_snippets,
            create_snippet,
            update_snippet,
            delete_snippet,
            get_settings,
            update_setting,
            add_custom_engine,
            delete_custom_engine,
            begin_hotkey_capture,
            cancel_hotkey_capture,
            update_tray_menu,
            translate,
            save_png_file,
            export_backup,
            import_backup
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
