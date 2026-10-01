//! The typing state the search field reports: Caps Lock, and which half of the
//! input method is active.
//!
//! The palette is a launcher, so the field it opens is almost always expecting
//! Latin text — an app name, a prefix, a URL. A Chinese IME left in its native
//! mode turns the first keystroke into pinyin and the field into a candidate list,
//! which is the opposite of what a launcher is for. So the panel asks the IME to
//! start in English, and shows what it found either way: a badge the user can
//! trust beats a silent mode they have to discover by typing.
//!
//! Two of the three facts are Win32's, not the page's. `getModifierState` knows
//! Caps Lock but nothing about the IME, and the IME's mode is per-thread state
//! owned by the foreground window — there is no web API for it at all. So the
//! answer comes from here, and the page only renders it.
//!
//! Everything is best-effort. A failure means no badge and no mode change, which
//! is exactly how the app behaved before any of this existed.

#[cfg(windows)]
mod platform {
    use windows::Win32::Foundation::HWND;
    use windows::Win32::UI::Input::Ime::{
        ImmGetContext, ImmGetConversionStatus, ImmReleaseContext, ImmSetConversionStatus,
        IME_CMODE_ALPHANUMERIC, IME_CMODE_NATIVE, IME_CONVERSION_MODE, IME_SENTENCE_MODE,
    };
    use windows::Win32::UI::Input::KeyboardAndMouse::{GetKeyState, VK_CAPITAL};

    #[derive(serde::Serialize)]
    pub struct InputState {
        /// Caps Lock is on.
        pub caps: bool,
        /// An input method is active for this window at all.
        pub ime: bool,
        /// That input method is in its native mode — Chinese for a Chinese IME.
        pub native: bool,
    }

    /// The window handle, in this crate's `windows` release.
    ///
    /// `tauri::WebviewWindow::hwnd` hands back the `HWND` of whatever `windows`
    /// version tauri resolved, which is not the one these calls are compiled
    /// against — two crates in the same graph, and the types do not unify. A
    /// handle is a pointer in both, with the same ABI and the same meaning, so the
    /// value is carried across by hand. This is the only place the two meet.
    fn our_hwnd(window: &tauri::WebviewWindow) -> Option<HWND> {
        let hwnd = window.hwnd().ok()?;
        let raw = hwnd.0 as *mut core::ffi::c_void;
        Some(HWND(raw))
    }

    /// What the field should show right now.
    pub(crate) fn state(window: &tauri::WebviewWindow) -> InputState {
        let empty = InputState {
            caps: false,
            ime: false,
            native: false,
        };
        let Some(hwnd) = our_hwnd(window) else {
            return empty;
        };

        // `GetKeyState` reports the toggle state, which is what the keyboard light
        // shows. Its low bit is "on"; the high bit means "currently pressed", which
        // is not the same question.
        let caps = unsafe { GetKeyState(VK_CAPITAL.0 as i32) & 1 != 0 };

        let mut ime = false;
        let mut native = false;
        unsafe {
            let himc = ImmGetContext(hwnd);
            if !himc.is_invalid() {
                let mut conversion = IME_CONVERSION_MODE(0);
                let mut sentence = IME_SENTENCE_MODE(0);
                // A window with no input method fails here, which is the honest
                // answer: there is no mode to report and no badge to draw.
                if ImmGetConversionStatus(himc, Some(&mut conversion), Some(&mut sentence)).as_bool() {
                    ime = true;
                    native = conversion.0 & IME_CMODE_NATIVE.0 != 0;
                }
                let _ = ImmReleaseContext(hwnd, himc);
            }
        }

        InputState { caps, ime, native }
    }

    /// Asks the window's input method to start in English.
    ///
    /// This is the same switch the language bar's 中/英 button throws: clearing
    /// `IME_CMODE_NATIVE` selects the alphanumeric half. It is a request, not a
    /// lock — a user who wants pinyin in the palette can still switch back, and an
    /// IME that ignores it simply keeps its mode.
    pub(crate) fn start_in_english(window: &tauri::WebviewWindow) {
        let Some(hwnd) = our_hwnd(window) else {
            return;
        };
        unsafe {
            let himc = ImmGetContext(hwnd);
            if himc.is_invalid() {
                return;
            }
            let _ = ImmSetConversionStatus(himc, IME_CMODE_ALPHANUMERIC, IME_SENTENCE_MODE(0));
            let _ = ImmReleaseContext(hwnd, himc);
        }
    }
}

#[cfg(not(windows))]
mod platform {
    /// macOS picks an input source per application, not per window, and exposes no
    /// mode to read or set from here. The page still reports Caps Lock itself, so
    /// the badge for that works everywhere; these two simply have nothing to say.
    #[derive(serde::Serialize)]
    pub struct InputState {
        pub caps: bool,
        pub ime: bool,
        pub native: bool,
    }

    pub(crate) fn state(_window: &tauri::WebviewWindow) -> InputState {
        InputState {
            caps: false,
            ime: false,
            native: false,
        }
    }

    pub(crate) fn start_in_english(_window: &tauri::WebviewWindow) {}
}

pub use platform::InputState;

/// The badge the search field draws, asked for when the palette opens and after
/// each keystroke — switching between 中 and 英 is a keystroke, and the badge is
/// wrong until it is asked again.
#[tauri::command]
pub fn input_state(window: tauri::WebviewWindow) -> InputState {
    platform::state(&window)
}

/// Called when the palette opens, so the first keystroke lands in the field
/// instead of a candidate window.
#[tauri::command]
pub fn ime_use_english(window: tauri::WebviewWindow) {
    platform::start_in_english(&window);
}
