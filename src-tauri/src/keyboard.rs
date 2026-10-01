//! Caps Lock, which the search field reports as a badge.
//!
//! The page can read this itself — `KeyboardEvent.getModifierState("CapsLock")` —
//! but only once a key has been pressed. Asking here as well means the badge is
//! right from the moment the palette opens, which is exactly when it matters: the
//! user is about to type and has not typed yet.
//!
//! The input method's mode is deliberately absent. It was tried and removed, and
//! the reasons are worth keeping: `ImmSetConversionStatus` is answered by the old
//! IMM32 input methods and ignored by every modern TSF one, which is what
//! Microsoft Pinyin and WeChat's IME both are — a GitHub code search for it returns
//! 24 hits and every one is a header, a Wine compatibility stub or an SDK sysroot,
//! with no application calling it at all. The TSF alternative,
//! `GUID_COMPARTMENT_KEYBOARD_INPUTMODE_CONVERSION`, is read and written only by
//! input methods themselves (rime/weasel, google/mozc, corvusskk); nothing outside
//! one drives it. The mode is the input method's own state, kept in its own
//! configuration, with no public API — deliberately, because an application that
//! could flip a user's 中/英 would be a menace. Measured here: after the palette
//! asked for English, typing `nihao` in Notepad still opened the WeChat IME's
//! candidate window.

#[cfg(windows)]
use windows::Win32::UI::Input::KeyboardAndMouse::{GetKeyState, VK_CAPITAL};

/// Whether Caps Lock is on.
///
/// `GetKeyState` reports the toggle state, which is what the keyboard light shows.
/// Its low bit is "on"; the high bit means "currently pressed", which is a
/// different question and the wrong one here.
pub(crate) fn caps_lock_on() -> bool {
    #[cfg(windows)]
    {
        unsafe { GetKeyState(VK_CAPITAL.0 as i32) & 1 != 0 }
    }
    #[cfg(not(windows))]
    {
        // No equivalent to ask before the first keystroke. The page fills this in
        // itself as soon as the user types, so the badge is only late, not wrong.
        false
    }
}

/// Asked for when the palette opens, so the badge is right before the first
/// keystroke rather than after it.
#[tauri::command]
pub fn caps_lock_state() -> bool {
    caps_lock_on()
}
