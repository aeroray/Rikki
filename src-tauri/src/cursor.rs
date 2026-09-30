//! Windows cursor-visibility repair.
//!
//! `ShowCursor` is a *counter*, not a boolean: the cursor is drawn only while
//! the count is >= 0, and `ShowCursor(TRUE)`/`ShowCursor(FALSE)` move it up and
//! down. tao (the windowing layer under Tauri) tracks that state as a plain
//! `bool` in `set_cursor_hidden`, so it only calls `ShowCursor` when its own
//! flag flips:
//!
//! ```text
//! static HIDDEN: AtomicBool = AtomicBool::new(false);
//! let changed = HIDDEN.swap(hidden, SeqCst) ^ hidden;
//! if changed { ShowCursor(!hidden) }
//! ```
//!
//! That is fine until something else hides the cursor without going through tao
//! — a native popup menu, another window, a caller that died mid-hide. The
//! counter then sits below zero while tao still believes the cursor is visible,
//! so tao never calls `ShowCursor(TRUE)` again and the cursor stays invisible
//! for the rest of the process's life. That is what happens after right-clicking
//! the tray menu.
//!
//! We never hide the cursor ourselves (`set_cursor_visible` is not called
//! anywhere in this crate), so a negative counter is always a stuck state and
//! raising it back to 0 is always correct. See
//! <https://github.com/tauri-apps/tao/pull/1249> for the still-open upstream fix.

/// Reads the display counter without changing it.
///
/// `ShowCursor` returns the *new* count, so a down-then-up pair leaves the
/// counter where it was and reports the original value.
#[cfg(target_os = "windows")]
fn display_count() -> i32 {
    use windows::Win32::UI::WindowsAndMessaging::ShowCursor;
    unsafe {
        let after_down = ShowCursor(false);
        ShowCursor(true);
        after_down + 1
    }
}

/// Raises a suppressed cursor back to visible, and does nothing otherwise.
///
/// Only ever increments while the counter is negative: calling
/// `ShowCursor(TRUE)` on a healthy counter would inflate it, and a later
/// legitimate hide would then not hide anything.
#[cfg(target_os = "windows")]
pub fn ensure_cursor_visible() {
    use windows::Win32::UI::WindowsAndMessaging::ShowCursor;
    unsafe {
        // Bounded so a pathological counter can never spin here.
        for _ in 0..16 {
            if display_count() >= 0 {
                return;
            }
            ShowCursor(true);
        }
    }
}

#[cfg(not(target_os = "windows"))]
pub fn ensure_cursor_visible() {}

/// Repairs the cursor a few times over the next moment.
///
/// A native popup menu hides the cursor on its own schedule, so a repair that
/// runs only once, immediately, can happen before the menu has done its hiding.
/// This sweeps a short window instead, and stops on its own — there is no
/// permanent timer. Used after the tray menu opens, where no "menu closed" event
/// exists for the dismiss-without-selecting case.
#[cfg(target_os = "windows")]
pub fn repair_cursor_soon() {
    std::thread::spawn(|| {
        for _ in 0..6 {
            std::thread::sleep(std::time::Duration::from_millis(250));
            ensure_cursor_visible();
        }
    });
}

#[cfg(not(target_os = "windows"))]
pub fn repair_cursor_soon() {}

#[cfg(test)]
mod tests {
    #[test]
    #[cfg(target_os = "windows")]
    fn repairing_does_not_inflate_a_healthy_counter() {
        super::ensure_cursor_visible();
        let before = super::display_count();
        super::ensure_cursor_visible();
        let after = super::display_count();
        // A visible cursor must be left exactly as it was found.
        assert_eq!(before, after, "repair must not raise a healthy counter");
    }

    #[test]
    #[cfg(target_os = "windows")]
    fn repairing_recovers_a_suppressed_counter() {
        use windows::Win32::UI::WindowsAndMessaging::ShowCursor;
        let start = super::display_count();
        unsafe {
            // Simulate the unbalanced hide that a native menu can leave behind.
            ShowCursor(false);
            assert!(super::display_count() < 0);
            super::ensure_cursor_visible();
            assert!(super::display_count() >= 0, "cursor should be visible again");
            // Restore the machine's original state.
            while super::display_count() > start {
                ShowCursor(false);
            }
        }
    }

    #[test]
    #[cfg(not(target_os = "windows"))]
    fn ensure_cursor_visible_is_a_no_op_off_windows() {
        super::ensure_cursor_visible();
    }
}
