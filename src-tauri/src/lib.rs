use std::sync::Mutex;
use std::time::{Duration, Instant};

use tauri::{Emitter, Manager, WebviewWindow};
use tauri_plugin_global_shortcut::{GlobalShortcutExt, ShortcutState};

mod apps;
mod apps_icons;
#[cfg(windows)]
mod autofill;
mod commands;
mod cursor;
mod ime;
mod input;
#[cfg(windows)]
mod permissions;
mod storage;
#[cfg(desktop)]
mod tray;

use commands::anniversary::{
    create_anniversary, delete_anniversary, get_anniversaries, update_anniversary,
};
use commands::apps::{bump_usage, get_installed_apps, get_usage_counts, launch_app, AppIndex};
use commands::calc::{get_calc_history, save_calc_history};
use commands::qr::save_png_file;
use commands::settings::{
    add_custom_engine, begin_hotkey_capture, cancel_hotkey_capture, delete_custom_engine,
    get_settings, update_setting, update_tray_menu,
};
use commands::transfer::{export_settings, import_settings, pick_import_file};
use commands::translate::{lookup_word, pronounce, pronounce_sentence, translate, translate_llm};
use commands::web::{list_browsers, open_web_url};
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

fn set_ignore_blur(app: &tauri::AppHandle, ignore: bool) {
    if let Some(state) = app.try_state::<PaletteState>() {
        *lock(&state.ignore_blur) = ignore;
    }
}

/// A system dialog is on screen, and the palette must not be over it.
///
/// Two things have to hold while it is open, and they only work as a pair. The
/// palette is a topmost window (`alwaysOnTop` in `tauri.conf.json`), and the
/// dialog has no owner to keep it above one: `tauri-plugin-dialog` leaves
/// `parent` unset, so rfd hands a null owner to `IFileDialog::Show` and Windows
/// is free to paint a `WS_EX_TOPMOST` window over it — which is what covered the
/// dialog's own buttons. Dropping topmost is what puts the dialog back on top.
///
/// The other half is the blur. The dialog takes focus, and hiding on blur is
/// exactly what the palette does with a focus it lost; without the suppression
/// it would take the screen the user was on down with it.
///
/// Both are restored on drop, on every path out of the command, a cancelled
/// dialog included.
pub(crate) struct NativeDialog {
    app: tauri::AppHandle,
    window: Option<WebviewWindow>,
    /// Read before the change rather than assumed, so a palette that was not
    /// topmost is not made topmost by the act of closing a dialog.
    restore_topmost: bool,
}

pub(crate) fn begin_native_dialog(app: &tauri::AppHandle) -> NativeDialog {
    let window = palette_window(app);
    let restore_topmost = window
        .as_ref()
        .and_then(|window| window.is_always_on_top().ok())
        .unwrap_or(true);
    if let Some(window) = window.as_ref() {
        let _ = window.set_always_on_top(false);
        // Reading the flag back is a round trip through the main thread's
        // message queue, so it cannot answer before the change above has been
        // applied. That matters because the dialog is opened from a blocking
        // thread a moment later, and `HWND_NOTOPMOST` puts a window at the
        // *front* of the non-topmost band: a palette that stepped aside after
        // the dialog appeared would land back on top of it.
        let _ = window.is_always_on_top();
    }
    set_ignore_blur(app, true);
    NativeDialog {
        app: app.clone(),
        window,
        restore_topmost,
    }
}

impl Drop for NativeDialog {
    fn drop(&mut self) {
        // Before the flag is cleared, so a focus event the dialog left behind
        // cannot hide the palette in the moment it comes back.
        mark_shown(&self.app);
        set_ignore_blur(&self.app, false);
        let Some(window) = self.window.as_ref() else {
            return;
        };
        if self.restore_topmost {
            let _ = window.set_always_on_top(true);
        }
        // The dialog had the keyboard, and a palette that comes back looking
        // exactly as it did while swallowing nothing is the state this whole
        // guard exists to avoid. Unless it was hidden while the dialog was up —
        // the hotkey still works during one — in which case it stays hidden and
        // the next show is the one that takes focus.
        if window.is_visible().unwrap_or(false) {
            let _ = window.set_focus();
        }
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
        // The key was released for the capture, so another application can take
        // it in the meantime. That leaves the app with no hotkey while the
        // settings file and the settings screen still name this one, which is
        // worth saying out loud even though nothing here can fix it.
        if let Err(err) = app.global_shortcut().register(hotkey.as_str()) {
            eprintln!("rikki: could not restore the hotkey after capture ({hotkey}): {err}");
        }
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
    if !settings_store::valid_hotkey(next) {
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
        // The recorder is still armed on screen while the old shortcut is live
        // again, which is the same trap `restore_hotkey_capture` announces: the
        // panel keeps saying "press the new shortcut" and pressing the old one
        // is swallowed by the global hotkey instead of being recorded.
        let _ = app.emit("hotkey-capture-cancelled", ());
        return Err(format!("register hotkey: {err}"));
    }

    *lock(&state.hotkey) = next.to_string();
    *lock(&state.capturing_hotkey) = false;
    let _ = tray::set_tooltip(app, next);

    match settings_store::update_setting(app, "hotkey", next) {
        Ok(settings) => Ok(settings),
        Err(err) => {
            // Both halves are undone, and both are undone for the empty `old`
            // too. `old` is empty when startup found no free hotkey at all, and
            // leaving `next` in the state would then claim a key that has just
            // been unregistered: the next attempt to set that same key takes
            // the "already registered" path above and never registers it, so
            // the settings screen would advertise a shortcut that does nothing.
            let _ = gs.unregister(next);
            if !old.is_empty() {
                let _ = gs.register(old.as_str());
            }
            *lock(&state.hotkey) = old.clone();
            let _ = tray::set_tooltip(app, &old);
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
        .plugin(tauri_plugin_power_manager::init())
        // The updater checks the endpoint in `tauri.conf.json` and verifies the
        // download against the public key there; `process` is what relaunches
        // the app once a macOS update is on disk, since replacing a running
        // `.app` is not something the installer can do for us there.
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_process::init())
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
                        // shortcut that is not the one actually in effect. A
                        // failure to write that is worth a line in the log: the
                        // registration above is what the user has, and the file
                        // is now the only place that disagrees.
                        if let Err(err) =
                            settings_store::update_setting(app.handle(), "hotkey", fallback)
                        {
                            eprintln!("rikki: could not persist the fallback hotkey: {err}");
                        }
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

            // Unconditional, empty included: `tray::install` seeds the tooltip
            // with the platform default, so on a machine where neither the
            // configured key nor the default could be registered the tray would
            // go on advertising a shortcut that does nothing.
            #[cfg(desktop)]
            let _ = tray::set_tooltip(app.handle(), &registered_hotkey);

            let handle = app.handle().clone();
            std::thread::spawn(move || {
                let _ = commands::apps::warm(&handle);
            });

            if let Some(window) = palette_window(app.handle()) {
                apply_platform_window(&window);
                // Before the first page load can ask for anything. A launcher
                // must not answer a keystroke with a permission dialog, and the
                // page has no use for one: see `permissions`.
                #[cfg(windows)]
                permissions::mute_prompts(&window);
                // Same reason, different affordance: WebView2's autofill
                // dropdown takes Tab, which is the clipboard preview key.
                #[cfg(windows)]
                autofill::disable(&window);
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
            translate_llm,
            lookup_word,
            pronounce,
            pronounce_sentence,
            save_png_file,
            export_settings,
            pick_import_file,
            import_settings,
            list_browsers,
            open_web_url,
            ime::input_state,
            ime::ime_use_english
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
