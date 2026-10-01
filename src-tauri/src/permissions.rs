//! Answers WebView2's permission requests without showing its dialog.
//!
//! WebView2 raises `PermissionRequested` for the browser permissions a page can
//! ask for, and its default answer is a system dialog. That dialog is a modal
//! that takes the keyboard, cannot be answered without leaving the palette, and
//! — because the palette hides on blur — can still be on screen after the window
//! it belongs to is gone. A launcher answers a keystroke; it does not ask a
//! question. So the request is answered here, on the Rust side, and the dialog is
//! never created at all.
//!
//! Setting `State` is what suppresses the default UI: that is exactly what `wry`
//! relies on for the one permission it does handle, its opt-in
//! `with_clipboard(true)`. Tauri leaves that attribute off, which is why
//! `navigator.clipboard.read()` reached the user as a prompt in the first place —
//! see the `navigator.clipboard` tombstone in `docs/memory/do-not-use.md`.
//!
//! Nothing in the page needs any of these permissions. The clipboard is read and
//! written in Rust through the clipboard plugin, the pronunciation audio is
//! fetched in Rust and played from a `data:` URL, and there is no camera,
//! microphone, geolocation, notification or file-picker surface anywhere in the
//! app. This is the structural half of that tombstone: the entry says not to call
//! `navigator.clipboard`, and this makes a call that slips back in fail quietly
//! instead of going modal.
//!
//! Every request is logged, because a permission the app did not think it used is
//! exactly the thing worth knowing about. The line names the kind and says which
//! way it was answered.

use webview2_com::Microsoft::Web::WebView2::Win32::{
    ICoreWebView2PermissionRequestedEventArgs, COREWEBVIEW2_PERMISSION_KIND,
    COREWEBVIEW2_PERMISSION_KIND_AUTOPLAY, COREWEBVIEW2_PERMISSION_KIND_CAMERA,
    COREWEBVIEW2_PERMISSION_KIND_CLIPBOARD_READ, COREWEBVIEW2_PERMISSION_KIND_FILE_READ_WRITE,
    COREWEBVIEW2_PERMISSION_KIND_GEOLOCATION, COREWEBVIEW2_PERMISSION_KIND_LOCAL_FONTS,
    COREWEBVIEW2_PERMISSION_KIND_MICROPHONE,
    COREWEBVIEW2_PERMISSION_KIND_MIDI_SYSTEM_EXCLUSIVE_MESSAGES,
    COREWEBVIEW2_PERMISSION_KIND_MULTIPLE_AUTOMATIC_DOWNLOADS,
    COREWEBVIEW2_PERMISSION_KIND_NOTIFICATIONS, COREWEBVIEW2_PERMISSION_KIND_OTHER_SENSORS,
    COREWEBVIEW2_PERMISSION_KIND_UNKNOWN_PERMISSION,
    COREWEBVIEW2_PERMISSION_KIND_WINDOW_MANAGEMENT, COREWEBVIEW2_PERMISSION_STATE,
    COREWEBVIEW2_PERMISSION_STATE_ALLOW, COREWEBVIEW2_PERMISSION_STATE_DENY,
};
use webview2_com::PermissionRequestedEventHandler;

/// What the palette answers for one permission kind, and what to call it in the
/// log.
///
/// Everything is denied except autoplay, and the two halves have different
/// reasons. A denial costs nothing because none of these surfaces exist in the
/// app — and a silent denial is what a regression should look like, not a dialog
/// the user has to dismiss. Autoplay is the one exception: it is not a capability
/// the app lacks but a playback policy, the only media in the app is the
/// pronunciation clip it fetched itself in Rust, and the failure mode of denying
/// it is a button that does nothing.
fn decision(kind: COREWEBVIEW2_PERMISSION_KIND) -> (&'static str, COREWEBVIEW2_PERMISSION_STATE) {
    match kind {
        COREWEBVIEW2_PERMISSION_KIND_AUTOPLAY => ("autoplay", COREWEBVIEW2_PERMISSION_STATE_ALLOW),
        // The one that used to reach the user: WebView2 answers
        // `navigator.clipboard.read()` with "想要 查看复制到剪贴板的文本和图像" in the
        // middle of a keystroke. The clipboard plugin reads the same data in
        // Rust, so the page never needs this.
        COREWEBVIEW2_PERMISSION_KIND_CLIPBOARD_READ => denied("clipboard-read"),
        COREWEBVIEW2_PERMISSION_KIND_MICROPHONE => denied("microphone"),
        COREWEBVIEW2_PERMISSION_KIND_CAMERA => denied("camera"),
        COREWEBVIEW2_PERMISSION_KIND_GEOLOCATION => denied("geolocation"),
        COREWEBVIEW2_PERMISSION_KIND_NOTIFICATIONS => denied("notifications"),
        COREWEBVIEW2_PERMISSION_KIND_OTHER_SENSORS => denied("other-sensors"),
        COREWEBVIEW2_PERMISSION_KIND_MULTIPLE_AUTOMATIC_DOWNLOADS => {
            denied("multiple-automatic-downloads")
        }
        COREWEBVIEW2_PERMISSION_KIND_FILE_READ_WRITE => denied("file-read-write"),
        COREWEBVIEW2_PERMISSION_KIND_LOCAL_FONTS => denied("local-fonts"),
        COREWEBVIEW2_PERMISSION_KIND_MIDI_SYSTEM_EXCLUSIVE_MESSAGES => {
            denied("midi-system-exclusive-messages")
        }
        COREWEBVIEW2_PERMISSION_KIND_WINDOW_MANAGEMENT => denied("window-management"),
        // `COREWEBVIEW2_PERMISSION_KIND_UNKNOWN_PERMISSION`, and anything a later
        // WebView2 adds: a kind this build has never heard of is one the app has
        // never used either, and the log line is where it shows up.
        _ => denied("unknown"),
    }
}

/// The answer for everything the app has no use for.
fn denied(name: &'static str) -> (&'static str, COREWEBVIEW2_PERMISSION_STATE) {
    (name, COREWEBVIEW2_PERMISSION_STATE_DENY)
}

/// Attaches the handler that answers permission requests for `window`.
///
/// Called once, from `setup`, where the webview already exists. A failure here is
/// logged rather than fatal: the palette works without it, it would just ask the
/// user a question the app does not want to ask.
pub(crate) fn mute_prompts(window: &tauri::WebviewWindow) {
    let attached = window.with_webview(|webview| unsafe {
        let Ok(core) = webview.controller().CoreWebView2() else {
            eprintln!("rikki: the webview has no CoreWebView2 to attach the permission handler to");
            return;
        };
        let handler = PermissionRequestedEventHandler::create(Box::new(
            move |_sender, args: Option<ICoreWebView2PermissionRequestedEventArgs>| {
                let Some(args) = args else {
                    return Ok(());
                };
                let mut kind = COREWEBVIEW2_PERMISSION_KIND_UNKNOWN_PERMISSION;
                let _ = args.PermissionKind(&mut kind);
                let (name, state) = decision(kind);
                let verdict = if state == COREWEBVIEW2_PERMISSION_STATE_ALLOW {
                    "allowed"
                } else {
                    "denied"
                };
                eprintln!("rikki: {name} permission requested; {verdict} without a dialog");
                let _ = args.SetState(state);
                Ok(())
            },
        ));
        let mut token = 0i64;
        match core.add_PermissionRequested(&handler, &mut token) {
            // One line at startup, because the guard is silent by design: a
            // prompt that comes back later is otherwise indistinguishable from
            // one this never covered.
            Ok(()) => eprintln!("rikki: permission prompts muted"),
            Err(err) => eprintln!("rikki: could not attach the permission handler: {err}"),
        }
    });
    if let Err(err) = attached {
        eprintln!("rikki: could not reach the webview to mute permission prompts: {err}");
    }
}
