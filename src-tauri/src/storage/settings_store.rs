use std::fs;
use std::path::PathBuf;
use std::time::{SystemTime, UNIX_EPOCH};

use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Manager};

use crate::storage::json_file;

const SETTINGS_FILE: &str = "settings.json";
const DEFAULT_ENGINE: &str = "bing";
const SETTINGS_VERSION: u32 = 6;
const DEFAULT_TRANSLATE_URL: &str = "https://api.fanyi.baidu.com/api/trans/vip/translate";
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
    #[serde(default)]
    pub baidu_translate_app_id: String,
    #[serde(default)]
    pub baidu_translate_secret_key: String,
    #[serde(default = "default_translate_url")]
    pub translation_api_url: String,
    #[serde(default)]
    pub translate_default_target: String,
    #[serde(default = "default_translate_second_target")]
    pub translate_second_target: String,
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

fn default_translate_url() -> String {
    DEFAULT_TRANSLATE_URL.into()
}

fn default_translate_second_target() -> String {
    "en".into()
}

const TRANSLATE_LANGS: &[&str] = &["zh", "en", "ja", "ko", "fr", "de", "es", "ru", "th", "vi"];

fn valid_translate_lang(code: &str) -> bool {
    TRANSLATE_LANGS.contains(&code)
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

fn settings_path(app: &AppHandle) -> Result<PathBuf, String> {
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
        baidu_translate_app_id: String::new(),
        baidu_translate_secret_key: String::new(),
        translation_api_url: default_translate_url(),
        translate_default_target: String::new(),
        translate_second_target: default_translate_second_target(),
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

pub fn resolved_translate_url(settings: &Settings) -> String {
    let url = settings.translation_api_url.trim();
    if valid_translate_url(url) {
        url.to_string()
    } else {
        default_translate_url()
    }
}

fn valid_translate_url(url: &str) -> bool {
    url.trim().starts_with("https://api.fanyi.baidu.com/")
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
    settings.baidu_translate_app_id = settings.baidu_translate_app_id.trim().to_string();
    settings.baidu_translate_secret_key = settings.baidu_translate_secret_key.trim().to_string();
    let url = settings.translation_api_url.trim();
    if url.is_empty() || !valid_translate_url(url) {
        settings.translation_api_url = default_translate_url();
    } else {
        settings.translation_api_url = url.to_string();
    }
    settings.translate_default_target = settings
        .translate_default_target
        .trim()
        .to_ascii_lowercase();
    settings.translate_second_target = settings
        .translate_second_target
        .trim()
        .to_ascii_lowercase();
    if !settings.translate_default_target.is_empty()
        && !valid_translate_lang(&settings.translate_default_target)
    {
        settings.translate_default_target.clear();
    }
    if !valid_translate_lang(&settings.translate_second_target) {
        settings.translate_second_target = default_translate_second_target();
    }
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
        "baiduTranslateAppId" | "baidu_translate_app_id" => {
            settings.baidu_translate_app_id = value.trim().to_string();
        }
        "baiduTranslateSecretKey" | "baidu_translate_secret_key" => {
            settings.baidu_translate_secret_key = value.trim().to_string();
        }
        "translationApiUrl" | "translation_api_url" => {
            let url = value.trim();
            if url.is_empty() {
                settings.translation_api_url = default_translate_url();
            } else if !valid_translate_url(url) {
                return Err("translate URL must be https://api.fanyi.baidu.com/…".into());
            } else {
                settings.translation_api_url = url.to_string();
            }
        }
        "translateDefaultTarget" | "translate_default_target" => {
            let code = value.trim().to_ascii_lowercase();
            if !valid_translate_lang(&code) {
                return Err(format!("unknown translate language: {value}"));
            }
            settings.translate_default_target = code;
        }
        "translateSecondTarget" | "translate_second_target" => {
            let code = value.trim().to_ascii_lowercase();
            if !valid_translate_lang(&code) {
                return Err(format!("unknown translate language: {value}"));
            }
            settings.translate_second_target = code;
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
        default_settings, normalize, valid_custom_url, CustomSearchEngine, Settings,
        DEFAULT_ENGINE,
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
        assert!(json.contains("translateDefaultTarget"));
        assert!(json.contains("translateSecondTarget"));
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
        assert_eq!(settings.translation_api_url, "https://api.fanyi.baidu.com/api/trans/vip/translate");
    }

    #[test]
    fn missing_translate_targets_use_empty_default_and_english_second() {
        let parsed: Settings = serde_json::from_str(r#"{"version":4}"#).expect("deserialize");
        assert!(parsed.translate_default_target.is_empty());
        assert_eq!(parsed.translate_second_target, "en");
    }

    #[test]
    fn invalid_translate_langs_normalize() {
        let settings = normalize(Settings {
            translate_default_target: "ZZ".into(),
            translate_second_target: "zz".into(),
            ..default_settings()
        });
        assert!(settings.translate_default_target.is_empty());
        assert_eq!(settings.translate_second_target, "en");
    }

    #[test]
    fn translate_lang_codes_normalize_case() {
        let settings = normalize(Settings {
            translate_default_target: "ZH".into(),
            translate_second_target: "JA".into(),
            ..default_settings()
        });
        assert_eq!(settings.translate_default_target, "zh");
        assert_eq!(settings.translate_second_target, "ja");
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
}
