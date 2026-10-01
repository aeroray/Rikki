//! Turns off WebView2's autofill suggestions.
//!
//! The palette's search field is not a form: it has no `name`, it is never
//! submitted, and `autocomplete="off"` on it is ignored. WebView2 keeps a
//! per-origin history of what has been typed into a text field and offers that
//! history back on Tab — and Tab is the one key the palette binds globally, where
//! it opens the clipboard preview. The dropdown swallowed the key, so the preview
//! never appeared and a native list opened instead.
//!
//! It is answered here rather than worked around in the page because it is not a
//! DOM event. A `keydown` handler cannot claim the key, in the bubble phase or in
//! the capture phase: by the time either runs, the webview has already acted. The
//! same reasoning as `permissions.rs` — a browser affordance that has no place in
//! a launcher is turned off at the source, not dodged at the call site.
//!
//! `IsGeneralAutofillEnabled` covers the general form history;
//! `IsPasswordAutosaveEnabled` covers the password manager, which this app has no
//! fields for. Both are off.

use webview2_com::Microsoft::Web::WebView2::Win32::ICoreWebView2Settings4;
use windows_core::Interface;

/// Applies the switches to `window`'s webview.
///
/// Called once, from `setup`, where the webview already exists. A failure is
/// logged rather than fatal: the palette works without it, Tab would just open a
/// suggestion list instead of a preview.
pub(crate) fn disable(window: &tauri::WebviewWindow) {
    let applied = window.with_webview(|webview| unsafe {
        let Ok(core) = webview.controller().CoreWebView2() else {
            eprintln!("rikki: the webview has no CoreWebView2 to turn autofill off on");
            return;
        };
        let Ok(settings) = core.Settings() else {
            eprintln!("rikki: the webview has no settings to turn autofill off on");
            return;
        };
        // `Settings` is the base interface; the autofill switches arrived in
        // Settings4, so the cast is the part that can fail on an older runtime.
        let Ok(settings4) = settings.cast::<ICoreWebView2Settings4>() else {
            eprintln!("rikki: this WebView2 runtime is too old to turn autofill off");
            return;
        };
        let general = settings4.SetIsGeneralAutofillEnabled(false);
        let passwords = settings4.SetIsPasswordAutosaveEnabled(false);
        match (general, passwords) {
            // One line at startup, because the guard is silent by design: a
            // dropdown that comes back later is otherwise indistinguishable from
            // one this never covered.
            (Ok(()), Ok(())) => eprintln!("rikki: webview autofill off"),
            (general, passwords) => eprintln!(
                "rikki: could not turn webview autofill off: general {general:?}, passwords {passwords:?}"
            ),
        }
    });
    if let Err(err) = applied {
        eprintln!("rikki: could not reach the webview to turn autofill off: {err}");
    }
}
