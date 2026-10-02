use std::collections::HashSet;
use std::fs;
use std::path::PathBuf;
use std::time::{SystemTime, UNIX_EPOCH};

use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Manager};

use crate::storage::json_file;

const SETTINGS_FILE: &str = "settings.json";
const DEFAULT_ENGINE: &str = "bing";
const SETTINGS_VERSION: u32 = 8;
const ENGINE_IDS: &[&str] = &["bing", "google", "baidu", "duckduckgo", "sogou"];

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CustomSearchEngine {
    pub id: String,
    pub name: String,
    pub url: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Settings {
    #[serde(default = "default_engine")]
    pub default_search_engine: String,
    #[serde(default = "default_theme")]
    pub theme: String,
    #[serde(default)]
    pub hotkey: String,
    #[serde(default = "default_locale")]
    pub locale: String,
    /// The language the user last chose to translate into, as a Youdao language code.
    /// Empty means "not chosen yet", and the frontend then picks the sensible
    /// default for the interface language.
    #[serde(default)]
    pub translate_target: String,
    /// The executable of the browser links open in. Empty means the system
    /// default, which is also what an unlaunchable path normalizes to.
    #[serde(default)]
    pub browser: String,
    #[serde(default)]
    pub custom_search_engines: Vec<CustomSearchEngine>,
    #[serde(default = "default_clip_text_retention_days")]
    pub clip_text_retention_days: Option<u32>,
    /// The release the user closed from the palette's update bar.
    ///
    /// Only that bar reads it. The settings row's own "check for updates" still
    /// finds the release and offers it, because that is the user asking on
    /// purpose — closing a notice means "stop telling me", not "never install
    /// this". Empty means nothing has been closed.
    #[serde(default)]
    pub dismissed_update_version: String,
    #[serde(default = "default_version")]
    pub version: u32,
}

fn default_engine() -> String {
    DEFAULT_ENGINE.into()
}

fn default_theme() -> String {
    "system".into()
}

fn default_locale() -> String {
    "system".into()
}

/// Language codes accepted as a translate target. One source of truth so
/// the validator and the error message cannot drift apart.
///
/// Deliberately four. The palette shows every target at once, and a list long
/// enough to need scrolling stops being readable at a glance — which is the only
/// reason the list is on screen at all. Must stay in step with `SUPPORTED_TARGETS`
/// in `src/lib/commands/translate/parse.ts`.
const TRANSLATE_TARGET_LANGS: &[&str] = &["zh-CHS", "en", "ja", "ko"];

fn valid_translate_target(code: &str) -> bool {
    TRANSLATE_TARGET_LANGS.contains(&code)
}

/// An empty browser is legal here and means "the system default" — unlike the
/// translate target, where empty is only a not-yet-chosen state. Anything else
/// has to be a file we could launch: `settings.json` is editable by hand, and a
/// browser that has since been uninstalled must not stay selected and leave
/// every search unable to open a link.
/// Trims the stored browser path. It deliberately does not check that the file is
/// still there: `normalize` runs on every load and its result is written back, so
/// a browser on a drive that is not mounted right now would lose the user's choice
/// the next time any unrelated setting changed. The one place that launches it
/// does check, and falls back to the system default.
fn normalize_browser(value: &str) -> String {
    value.trim().to_string()
}

fn default_clip_text_retention_days() -> Option<u32> {
    Some(7)
}

fn default_version() -> u32 {
    SETTINGS_VERSION
}

pub fn default_hotkey() -> &'static str {
    #[cfg(target_os = "macos")]
    {
        "Command+K"
    }
    #[cfg(not(target_os = "macos"))]
    {
        "Alt+Space"
    }
}

/// Public within the crate so an import can replace this file in the same commit
/// as the others it holds.
pub(crate) fn settings_path(app: &AppHandle) -> Result<PathBuf, String> {
    let dir = app
        .path()
        .app_data_dir()
        .map_err(|err| format!("resolve app data dir: {err}"))?;
    fs::create_dir_all(&dir).map_err(|err| format!("create app data dir: {err}"))?;
    Ok(dir.join(SETTINGS_FILE))
}

fn now_ms() -> i64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|duration| duration.as_millis() as i64)
        .unwrap_or(0)
}

fn default_settings() -> Settings {
    Settings {
        default_search_engine: default_engine(),
        theme: default_theme(),
        hotkey: String::new(),
        locale: default_locale(),
        translate_target: String::new(),
        browser: String::new(),
        custom_search_engines: Vec::new(),
        clip_text_retention_days: default_clip_text_retention_days(),
        dismissed_update_version: String::new(),
        version: default_version(),
    }
}

fn is_builtin_engine(id: &str) -> bool {
    ENGINE_IDS.contains(&id)
}

fn is_known_engine(settings: &Settings, id: &str) -> bool {
    is_builtin_engine(id)
        || settings
            .custom_search_engines
            .iter()
            .any(|engine| engine.id == id)
}

pub fn resolved_hotkey(settings: &Settings) -> String {
    let hotkey = settings.hotkey.trim();
    if hotkey.is_empty() {
        default_hotkey().into()
    } else {
        hotkey.to_string()
    }
}

/// A shortcut the app is willing to register: a modifier and a key.
///
/// The global-shortcut plugin accepts a bare key, and a bare key registered
/// globally is taken away from every other application — so `F5` in
/// `settings.json` must not become a system-wide grab. `settings.json` is
/// editable by hand, which is why this is shared with the IPC path rather than
/// checked only there: the two have to agree on what "a hotkey" is.
pub fn valid_hotkey(hotkey: &str) -> bool {
    let lower = hotkey.to_ascii_lowercase();
    lower.contains("control")
        || lower.contains("ctrl")
        || lower.contains("alt")
        || lower.contains("option")
        || lower.contains("command")
        || lower.contains("cmd")
        || lower.contains("super")
        || lower.contains("meta")
}

pub fn valid_custom_url(url: &str) -> bool {
    let url = url.trim();
    if url.len() > 500 {
        return false;
    }
    let lower = url.to_ascii_lowercase();
    if lower.contains("javascript:") || lower.contains("data:") {
        return false;
    }
    // Compared through `lower` so `HTTPS://…`, which is a perfectly ordinary
    // thing to paste, is not refused for its spelling while the opener in
    // `commands::web` accepts it case-insensitively.
    if !(lower.starts_with("https://") || lower.starts_with("http://")) {
        return false;
    }
    url.contains("%s")
}

/// Counted in characters, not bytes. `str::len` would reject a 14-character
/// Chinese engine name for exceeding a limit the message calls 40 characters.
fn valid_engine_name(name: &str) -> bool {
    (1..=40).contains(&name.trim().chars().count())
}

/// A free id for a new custom engine.
///
/// `custom_{ms}` cannot normally collide — the create form takes seconds to
/// fill in — but an id that is already taken is the worst of the options:
/// `normalize` keeps only the first engine with an id, so the engine just added
/// would disappear on the next load, and deleting either row would remove both.
fn unique_engine_id(existing: &[CustomSearchEngine], stamp: i64) -> String {
    let base = format!("custom_{stamp}");
    if !existing.iter().any(|engine| engine.id == base) {
        return base;
    }
    let mut suffix = 2;
    loop {
        let candidate = format!("{base}-{suffix}");
        if !existing.iter().any(|engine| engine.id == candidate) {
            return candidate;
        }
        suffix += 1;
    }
}

fn normalize_custom_url(url: &str) -> String {
    url.trim()
        .replace("{{query}}", "%s")
        .replace("{q}", "%s")
        .replace("{query}", "%s")
}

fn normalize(mut settings: Settings) -> Settings {
    // Trimmed first, so the checks below and the values the frontend renders
    // see the same string. `update_setting` trims as well; a hand-edited file
    // is the other way in, and a padded value must not be read as a different
    // engine or a different shortcut.
    let mut seen_ids = HashSet::new();
    settings.custom_search_engines.retain_mut(|engine| {
        engine.name = engine.name.trim().to_string();
        engine.url = engine.url.trim().to_string();
        !engine.id.is_empty()
            && !engine.name.is_empty()
            && valid_custom_url(&engine.url)
            && !is_builtin_engine(&engine.id)
            // Ids are how an engine is deleted and how the picker keys its
            // rows, so a file that repeats one would offer two rows that a
            // single delete removes.
            && seen_ids.insert(engine.id.clone())
    });
    if settings.theme != "light" && settings.theme != "dark" && settings.theme != "system" {
        settings.theme = default_theme();
    }
    if settings.locale != "system" && settings.locale != "zh-CN" && settings.locale != "en" {
        settings.locale = default_locale();
    }
    settings.translate_target = settings.translate_target.trim().to_string();
    if !valid_translate_target(&settings.translate_target) {
        settings.translate_target.clear();
    }
    settings.browser = normalize_browser(&settings.browser);
    settings.default_search_engine = settings.default_search_engine.trim().to_string();
    if !is_known_engine(&settings, &settings.default_search_engine) {
        settings.default_search_engine = default_engine();
    }
    settings.hotkey = settings.hotkey.trim().to_string();
    if !settings.hotkey.is_empty() && !valid_hotkey(&settings.hotkey) {
        settings.hotkey.clear();
    }
    settings.clip_text_retention_days = match settings.clip_text_retention_days {
        None => None,
        Some(0) => None,
        Some(7) | Some(30) => settings.clip_text_retention_days,
        Some(_) => Some(7),
    };
    settings.dismissed_update_version = settings.dismissed_update_version.trim().to_string();
    if settings.version < SETTINGS_VERSION {
        settings.version = default_version();
    }
    settings
}

pub fn normalize_imported(settings: Settings) -> Settings {
    let mut settings = settings;
    settings.version = default_version();
    normalize(settings)
}

pub fn load_settings(app: &AppHandle) -> Result<Settings, String> {
    let path = settings_path(app)?;
    match json_file::read_json::<Settings>(&path) {
        Ok(Some(parsed)) => Ok(normalize(parsed)),
        Ok(None) => {
            let settings = default_settings();
            save_settings(app, &settings)?;
            Ok(settings)
        }
        Err(err) => {
            // The damaged file was moved aside by `read_json`. Rebuilding the
            // defaults here keeps the app usable: previously every later
            // `update_setting` failed on the same parse error, so the user could
            // never change a setting again.
            eprintln!("rikki: {err}");
            let settings = default_settings();
            save_settings(app, &settings)?;
            Ok(settings)
        }
    }
}

pub fn save_settings(app: &AppHandle, settings: &Settings) -> Result<(), String> {
    json_file::write_json(&settings_path(app)?, settings)
}

pub fn update_setting(app: &AppHandle, key: &str, value: &str) -> Result<Settings, String> {
    let mut settings = load_settings(app)?;
    match key {
        "defaultSearchEngine" | "default_search_engine" => {
            let id = value.trim();
            if !is_known_engine(&settings, id) {
                return Err(format!("unknown search engine: {value}"));
            }
            settings.default_search_engine = id.to_string();
        }
        "theme" => {
            if value != "dark" && value != "light" && value != "system" {
                return Err(format!("unknown theme: {value}"));
            }
            settings.theme = value.to_string();
        }
        "hotkey" => {
            let hotkey = value.trim();
            if hotkey.is_empty() {
                return Err("hotkey is empty".into());
            }
            settings.hotkey = hotkey.to_string();
        }
        "locale" | "language" => {
            if value != "system" && value != "zh-CN" && value != "en" {
                return Err(format!("unknown locale: {value}"));
            }
            settings.locale = value.to_string();
        }
        "translateTarget" | "translate_target" => {
            let code = value.trim();
            if !valid_translate_target(code) {
                return Err(format!(
                    "unknown translate target: {value} (expected one of {})",
                    TRANSLATE_TARGET_LANGS.join(", ")
                ));
            }
            settings.translate_target = code.to_string();
        }
        "browser" => {
            // Deliberately not an error: a path that cannot be launched is the
            // same thing as "no choice", and saying so beats a message the user
            // cannot act on.
            settings.browser = normalize_browser(value);
        }
        "clipTextRetentionDays" | "clip_text_retention_days" => {
            let days = value.trim();
            settings.clip_text_retention_days = match days {
                "0" | "never" => None,
                "7" => Some(7),
                "30" => Some(30),
                _ => return Err(format!("unknown clip retention: {value}")),
            };
        }
        "dismissedUpdateVersion" | "dismissed_update_version" => {
            // Deliberately unvalidated. This is whatever version string the
            // updater reported, and the only thing ever done with it is an
            // equality check against the next string the updater reports — a
            // shape check here would only be a second opinion about a format
            // this app does not own.
            settings.dismissed_update_version = value.trim().to_string();
        }
        other => return Err(format!("unknown setting: {other}")),
    }
    save_settings(app, &settings)?;
    Ok(settings)
}

pub fn add_custom_engine(
    app: &AppHandle,
    name: String,
    url: String,
) -> Result<Settings, String> {
    let name = name.trim().to_string();
    if !valid_engine_name(&name) {
        return Err("engine name must be 1-40 characters".into());
    }
    let url = normalize_custom_url(&url);
    if !valid_custom_url(&url) {
        return Err("engine URL must be http(s) and contain %s".into());
    }
    let mut settings = load_settings(app)?;
    let id = unique_engine_id(&settings.custom_search_engines, now_ms());
    settings.custom_search_engines.push(CustomSearchEngine { id, name, url });
    save_settings(app, &settings)?;
    Ok(settings)
}

pub fn delete_custom_engine(app: &AppHandle, id: &str) -> Result<Settings, String> {
    if is_builtin_engine(id) {
        return Err("cannot delete a built-in engine".into());
    }
    let mut settings = load_settings(app)?;
    let before = settings.custom_search_engines.len();
    settings
        .custom_search_engines
        .retain(|engine| engine.id != id);
    if settings.custom_search_engines.len() == before {
        return Err("custom engine not found".into());
    }
    if settings.default_search_engine == id {
        settings.default_search_engine = default_engine();
    }
    save_settings(app, &settings)?;
    Ok(settings)
}

#[cfg(test)]
mod tests {
    use super::{
        default_settings, normalize, unique_engine_id, valid_custom_url, valid_engine_name,
        valid_hotkey, CustomSearchEngine, Settings, DEFAULT_ENGINE, TRANSLATE_TARGET_LANGS,
    };

    fn engine(id: &str, name: &str, url: &str) -> CustomSearchEngine {
        CustomSearchEngine {
            id: id.into(),
            name: name.into(),
            url: url.into(),
        }
    }

    fn sample() -> Settings {
        Settings {
            default_search_engine: "google".into(),
            ..default_settings()
        }
    }

    #[test]
    fn settings_json_uses_camel_case_fields() {
        let mut settings = sample();
        settings.custom_search_engines.push(CustomSearchEngine {
            id: "custom_1".into(),
            name: "GitHub".into(),
            url: "https://github.com/search?q=%s".into(),
        });
        let json = serde_json::to_string(&settings).expect("serialize");
        assert!(json.contains("defaultSearchEngine"));
        assert!(json.contains("customSearchEngines"));
        assert!(json.contains("translateTarget"));
        assert!(json.contains("clipTextRetentionDays"));
        assert!(json.contains("dismissedUpdateVersion"));
        assert!(!json.contains("default_search_engine"));
        let parsed: Settings = serde_json::from_str(&json).expect("deserialize");
        assert_eq!(parsed.default_search_engine, "google");
        assert_eq!(parsed.custom_search_engines[0].name, "GitHub");
    }

    #[test]
    fn missing_engine_defaults_to_bing() {
        let parsed: Settings = serde_json::from_str(r#"{"version":1}"#).expect("deserialize");
        assert_eq!(parsed.default_search_engine, DEFAULT_ENGINE);
        assert_eq!(parsed.theme, "system");
        assert!(parsed.custom_search_engines.is_empty());
    }

    #[test]
    fn unknown_engine_normalizes_to_bing() {
        let settings = normalize(Settings {
            default_search_engine: "yahoo".into(),
            theme: "neon".into(),
            ..default_settings()
        });
        assert_eq!(settings.default_search_engine, DEFAULT_ENGINE);
        assert_eq!(settings.theme, "system");
    }

    /// Following the OS is a preference in its own right, not a missing one.
    #[test]
    fn following_the_system_is_a_theme() {
        let settings = normalize(Settings {
            theme: "system".into(),
            ..default_settings()
        });
        assert_eq!(settings.theme, "system");
    }

    #[test]
    fn unknown_locale_normalizes_to_system() {
        let settings = normalize(Settings {
            locale: "fr".into(),
            ..default_settings()
        });
        assert_eq!(settings.locale, "system");
    }

    #[test]
    fn custom_default_engine_is_kept() {
        let settings = normalize(Settings {
            default_search_engine: "custom_1".into(),
            theme: "light".into(),
            hotkey: "Control+Space".into(),
            locale: "en".into(),
            custom_search_engines: vec![CustomSearchEngine {
                id: "custom_1".into(),
                name: "GitHub".into(),
                url: "https://github.com/search?q=%s".into(),
            }],
            ..default_settings()
        });
        assert_eq!(settings.default_search_engine, "custom_1");
        assert_eq!(settings.theme, "light");
        assert_eq!(settings.locale, "en");
    }

    #[test]
    fn missing_translate_target_defaults_to_empty() {
        let parsed: Settings = serde_json::from_str(r#"{"version":6}"#).expect("deserialize");
        assert!(parsed.translate_target.is_empty());
    }

    #[test]
    fn unknown_translate_target_normalizes_to_empty() {
        let settings = normalize(Settings {
            translate_target: "zz".into(),
            ..default_settings()
        });
        assert!(settings.translate_target.is_empty());
    }

    #[test]
    fn accepted_translate_targets_are_kept_and_trimmed() {
        for code in TRANSLATE_TARGET_LANGS {
            let settings = normalize(Settings {
                translate_target: format!("  {code}  "),
                ..default_settings()
            });
            assert_eq!(&settings.translate_target, code);
        }
    }

    #[test]
    fn custom_url_requires_https_and_placeholder() {
        assert!(valid_custom_url("https://github.com/search?q=%s"));
        assert!(!valid_custom_url("https://github.com/search?q="));
        assert!(!valid_custom_url("javascript:alert(%s)"));
    }

    #[test]
    fn missing_clip_retention_defaults_to_seven_days() {
        let parsed: Settings = serde_json::from_str(r#"{"version":5}"#).expect("deserialize");
        assert_eq!(parsed.clip_text_retention_days, Some(7));
    }

    #[test]
    fn null_or_zero_clip_retention_means_never() {
        let null_parsed: Settings =
            serde_json::from_str(r#"{"version":6,"clipTextRetentionDays":null}"#).expect("null");
        assert_eq!(normalize(null_parsed).clip_text_retention_days, None);
        let zero_parsed: Settings =
            serde_json::from_str(r#"{"version":6,"clipTextRetentionDays":0}"#).expect("zero");
        assert_eq!(normalize(zero_parsed).clip_text_retention_days, None);
    }

    #[test]
    fn invalid_clip_retention_normalizes_to_seven() {
        let settings = normalize(Settings {
            clip_text_retention_days: Some(15),
            ..default_settings()
        });
        assert_eq!(settings.clip_text_retention_days, Some(7));
    }

    #[test]
    fn missing_browser_defaults_to_the_system_default() {
        let parsed: Settings = serde_json::from_str(r#"{"version":7}"#).expect("deserialize");
        assert!(parsed.browser.is_empty());
    }

    /// A file written before the update bar had a close button reads as "nothing
    /// dismissed", which is what it meant at the time.
    #[test]
    fn missing_dismissed_update_version_defaults_to_empty() {
        let parsed: Settings = serde_json::from_str(r#"{"version":7}"#).expect("deserialize");
        assert!(parsed.dismissed_update_version.is_empty());
    }

    #[test]
    fn a_dismissed_update_version_is_trimmed_and_kept() {
        let settings = normalize(Settings {
            dismissed_update_version: "  1.1.0  ".into(),
            ..default_settings()
        });
        assert_eq!(settings.dismissed_update_version, "1.1.0");
    }

    #[test]
    fn an_existing_browser_path_is_kept_and_trimmed() {
        let exe = std::env::current_exe().expect("current exe");
        let exe = exe.to_string_lossy().into_owned();
        let settings = normalize(Settings {
            browser: format!("  {exe}  "),
            ..default_settings()
        });
        assert_eq!(settings.browser, exe);
    }

    /// A path that cannot be launched *right now* is still the user's choice.
    ///
    /// Clearing it would lose that choice the next time any setting was written,
    /// and a browser on a drive that is not mounted is the ordinary case rather
    /// than the odd one. `launch_command` already refuses a path that is not a
    /// file and falls back to the system default, so deciding it here as well
    /// protects nothing.
    #[test]
    fn an_unlaunchable_browser_path_is_still_remembered() {
        for browser in [
            r"C:\nope\gone\browser.exe".to_string(),
            // A directory exists but cannot be launched as a browser.
            std::env::temp_dir().to_string_lossy().into_owned(),
        ] {
            let settings = normalize(Settings {
                browser: browser.clone(),
                ..default_settings()
            });
            assert_eq!(settings.browser, browser);
        }
    }

    /// The global-shortcut plugin registers a bare key happily, and a key
    /// registered globally is gone from every other application. Only a
    /// hand-edited file can hold one, which is exactly why `normalize` has to
    /// reject it and not just the IPC path.
    #[test]
    fn a_hotkey_without_a_modifier_is_dropped() {
        for hotkey in ["F5", "A", "Shift+K", "Space"] {
            let settings = normalize(Settings {
                hotkey: hotkey.into(),
                ..default_settings()
            });
            assert!(
                settings.hotkey.is_empty(),
                "{hotkey} must not stay in the file"
            );
        }
    }

    #[test]
    fn a_hotkey_with_a_modifier_is_kept_and_trimmed() {
        for hotkey in ["Alt+Space", "Control+Shift+A", "Command+K", "Super+K"] {
            let settings = normalize(Settings {
                hotkey: format!("  {hotkey}  "),
                ..default_settings()
            });
            assert_eq!(settings.hotkey, hotkey);
        }
    }

    #[test]
    fn the_modifier_check_matches_what_the_recorder_produces() {
        assert!(valid_hotkey("Control+Alt+P"));
        assert!(valid_hotkey("Option+K"));
        assert!(!valid_hotkey(""));
        assert!(!valid_hotkey("Shift+F1"));
    }

    /// `str::len` counts bytes, so the byte-length check this replaces rejected
    /// a 14-character Chinese engine name against a limit of 40.
    #[test]
    fn an_engine_name_is_measured_in_characters() {
        assert!(valid_engine_name("浏览器"));
        assert!(valid_engine_name(&"搜".repeat(40)));
        assert!(!valid_engine_name(&"搜".repeat(41)));
        assert!(!valid_engine_name("   "));
    }

    #[test]
    fn an_uppercase_scheme_is_still_http() {
        assert!(valid_custom_url("HTTPS://github.com/search?q=%s"));
        assert!(valid_custom_url("Http://example.com/?q=%s"));
        assert!(!valid_custom_url("ftp://example.com/%s"));
        // Still refused whatever its case.
        assert!(!valid_custom_url("JavaScript:alert(%s)"));
    }

    #[test]
    fn a_padded_default_engine_is_still_that_engine() {
        let settings = normalize(Settings {
            default_search_engine: "  google  ".into(),
            ..default_settings()
        });
        assert_eq!(settings.default_search_engine, "google");
    }

    #[test]
    fn engines_are_trimmed_and_deduplicated() {
        let settings = normalize(Settings {
            default_search_engine: "custom_1".into(),
            custom_search_engines: vec![
                engine("custom_1", "  GitHub  ", " https://github.com/search?q=%s "),
                // The same id again: one delete would have removed both rows.
                engine("custom_1", "GitHub again", "https://example.com/?q=%s"),
                engine("custom_2", "Example", "https://example.com/?q=%s"),
            ],
            ..default_settings()
        });
        assert_eq!(settings.custom_search_engines.len(), 2);
        assert_eq!(settings.custom_search_engines[0].name, "GitHub");
        assert_eq!(
            settings.custom_search_engines[0].url,
            "https://github.com/search?q=%s"
        );
        assert_eq!(settings.default_search_engine, "custom_1");
    }

    #[test]
    fn a_new_engine_never_reuses_an_id_that_is_taken() {
        assert_eq!(unique_engine_id(&[], 5), "custom_5");
        let taken = vec![
            engine("custom_5", "a", "https://a.test/?q=%s"),
            engine("custom_5-2", "b", "https://b.test/?q=%s"),
        ];
        assert_eq!(unique_engine_id(&taken, 5), "custom_5-3");
    }
}
