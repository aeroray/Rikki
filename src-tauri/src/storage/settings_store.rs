use std::fs;
use std::path::{Path, PathBuf};
use std::time::{SystemTime, UNIX_EPOCH};

use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Manager};

use crate::storage::json_file;

const SETTINGS_FILE: &str = "settings.json";
const DEFAULT_ENGINE: &str = "bing";
const SETTINGS_VERSION: u32 = 7;
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
    #[serde(default = "default_version")]
    pub version: u32,
}

fn default_engine() -> String {
    DEFAULT_ENGINE.into()
}

fn default_theme() -> String {
    "dark".into()
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
fn normalize_browser(value: &str) -> String {
    let path = value.trim();
    if path.is_empty() || !Path::new(path).is_file() {
        return String::new();
    }
    path.to_string()
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

/// Public within the crate so a backup can replace this file in the same commit
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

pub fn valid_custom_url(url: &str) -> bool {
    let url = url.trim();
    if url.len() > 500 {
        return false;
    }
    let lower = url.to_ascii_lowercase();
    if lower.contains("javascript:") || lower.contains("data:") {
        return false;
    }
    if !(url.starts_with("https://") || url.starts_with("http://")) {
        return false;
    }
    url.contains("%s")
}

fn normalize_custom_url(url: &str) -> String {
    url.trim()
        .replace("{{query}}", "%s")
        .replace("{q}", "%s")
        .replace("{query}", "%s")
}

fn normalize(mut settings: Settings) -> Settings {
    settings.custom_search_engines.retain(|engine| {
        !engine.id.is_empty()
            && !engine.name.trim().is_empty()
            && valid_custom_url(&engine.url)
            && !is_builtin_engine(&engine.id)
    });
    if settings.theme != "light" && settings.theme != "dark" {
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
    if !is_known_engine(&settings, &settings.default_search_engine) {
        settings.default_search_engine = default_engine();
    }
    settings.clip_text_retention_days = match settings.clip_text_retention_days {
        None => None,
        Some(0) => None,
        Some(7) | Some(30) => settings.clip_text_retention_days,
        Some(_) => Some(7),
    };
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
            if !is_known_engine(&settings, value) {
                return Err(format!("unknown search engine: {value}"));
            }
            settings.default_search_engine = value.to_string();
        }
        "theme" => {
            if value != "dark" && value != "light" {
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
    if name.is_empty() || name.len() > 40 {
        return Err("engine name must be 1-40 characters".into());
    }
    let url = normalize_custom_url(&url);
    if !valid_custom_url(&url) {
        return Err("engine URL must be http(s) and contain %s".into());
    }
    let mut settings = load_settings(app)?;
    let id = format!("custom_{}", now_ms());
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
        default_settings, normalize, valid_custom_url, CustomSearchEngine, Settings, DEFAULT_ENGINE,
        TRANSLATE_TARGET_LANGS,
    };

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
        assert!(!json.contains("default_search_engine"));
        let parsed: Settings = serde_json::from_str(&json).expect("deserialize");
        assert_eq!(parsed.default_search_engine, "google");
        assert_eq!(parsed.custom_search_engines[0].name, "GitHub");
    }

    #[test]
    fn missing_engine_defaults_to_bing() {
        let parsed: Settings = serde_json::from_str(r#"{"version":1}"#).expect("deserialize");
        assert_eq!(parsed.default_search_engine, DEFAULT_ENGINE);
        assert_eq!(parsed.theme, "dark");
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
        assert_eq!(settings.theme, "dark");
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

    #[test]
    fn an_unlaunchable_browser_path_normalizes_to_the_system_default() {
        for browser in [
            r"C:\nope\gone\browser.exe".to_string(),
            // A directory exists but cannot be launched as a browser.
            std::env::temp_dir().to_string_lossy().into_owned(),
        ] {
            let settings = normalize(Settings {
                browser,
                ..default_settings()
            });
            assert!(settings.browser.is_empty());
        }
    }
}
