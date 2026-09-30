use std::path::PathBuf;
use std::time::{SystemTime, UNIX_EPOCH};

use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Manager};

use crate::storage::json_file;

const ANNIVERSARY_FILE: &str = "anniversaries.json";
const MAX_TITLE_CHARS: usize = 60;
/// `lunar` v2 converts solar dates in 1890-2100; staying inside that range
/// keeps every lunar lookup convertible instead of silently failing later.
const MIN_YEAR: i32 = 1890;
const MAX_YEAR: i32 = 2100;

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Anniversary {
    pub id: String,
    pub title: String,
    /// Solar month 1-12, or lunar month 1-12 depending on `calendar`.
    pub month: u32,
    /// Solar day 1-31, or lunar day 1-30 depending on `calendar`.
    pub day: u32,
    #[serde(default = "default_calendar")]
    pub calendar: String,
    /// Only meaningful for lunar dates: the leap month of that number.
    #[serde(default)]
    pub leap_month: bool,
    /// Optional origin year, used to show "第 N 年" for a recurring date.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub start_year: Option<i32>,
    pub created_at: i64,
    pub updated_at: i64,
}

fn default_calendar() -> String {
    "solar".into()
}

fn anniversary_path(app: &AppHandle) -> Result<PathBuf, String> {
    let dir = app
        .path()
        .app_data_dir()
        .map_err(|err| format!("resolve app data dir: {err}"))?;
    std::fs::create_dir_all(&dir).map_err(|err| format!("create app data dir: {err}"))?;
    Ok(dir.join(ANNIVERSARY_FILE))
}

fn now_ms() -> i64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|duration| duration.as_millis() as i64)
        .unwrap_or(0)
}

fn is_leap_year(year: i32) -> bool {
    (year % 4 == 0 && year % 100 != 0) || year % 400 == 0
}

fn solar_days_in_month(month: u32, year: i32) -> u32 {
    match month {
        1 | 3 | 5 | 7 | 8 | 10 | 12 => 31,
        4 | 6 | 9 | 11 => 30,
        2 if is_leap_year(year) => 29,
        2 => 28,
        _ => 0,
    }
}

struct Validated {
    title: String,
    month: u32,
    day: u32,
    calendar: String,
    leap_month: bool,
    start_year: Option<i32>,
}

fn validate(
    title: String,
    month: u32,
    day: u32,
    calendar: String,
    leap_month: bool,
    start_year: Option<i32>,
) -> Result<Validated, String> {
    let title = title.trim().to_string();
    if title.is_empty() {
        return Err("title is required".into());
    }
    if title.chars().count() > MAX_TITLE_CHARS {
        return Err(format!("title must be at most {MAX_TITLE_CHARS} characters"));
    }

    let calendar = calendar.trim().to_ascii_lowercase();
    if calendar != "solar" && calendar != "lunar" {
        return Err(format!("unknown calendar: {calendar}"));
    }

    if month < 1 || month > 12 {
        return Err("month must be between 1 and 12".into());
    }

    if calendar == "solar" {
        // Validated against a leap year so a Feb 29 birthday is accepted; the
        // countdown clamps it to Feb 28 in common years.
        if day < 1 || day > solar_days_in_month(month, 2024) {
            return Err(format!("day {day} is not valid for month {month}"));
        }
    } else if day < 1 || day > 30 {
        return Err("lunar day must be between 1 and 30".into());
    }

    let start_year = match start_year {
        Some(year) if (MIN_YEAR..=MAX_YEAR).contains(&year) => Some(year),
        Some(year) => return Err(format!("start year {year} is out of range")),
        None => None,
    };

    // A leap-month flag is meaningless for a solar date, so it is dropped here
    // rather than trusted from the caller.
    let leap_month = calendar == "lunar" && leap_month;

    Ok(Validated {
        title,
        month,
        day,
        calendar,
        leap_month,
        start_year,
    })
}

pub fn load_anniversaries(app: &AppHandle) -> Result<Vec<Anniversary>, String> {
    let path = anniversary_path(app)?;
    Ok(json_file::read_json::<Vec<Anniversary>>(&path)?.unwrap_or_default())
}

pub fn save_anniversaries(app: &AppHandle, items: &[Anniversary]) -> Result<(), String> {
    json_file::write_json(&anniversary_path(app)?, &items)
}

pub fn create_anniversary(
    app: &AppHandle,
    title: String,
    month: u32,
    day: u32,
    calendar: String,
    leap_month: bool,
    start_year: Option<i32>,
) -> Result<Anniversary, String> {
    let valid = validate(title, month, day, calendar, leap_month, start_year)?;
    let now = now_ms();
    let item = Anniversary {
        // The millisecond clock alone can repeat for two quick saves, which
        // would hand the list two rows with the same key.
        id: format!("ann_{now}_{:04x}", rand::random::<u16>()),
        title: valid.title,
        month: valid.month,
        day: valid.day,
        calendar: valid.calendar,
        leap_month: valid.leap_month,
        start_year: valid.start_year,
        created_at: now,
        updated_at: now,
    };

    let mut items = load_anniversaries(app)?;
    items.insert(0, item.clone());
    save_anniversaries(app, &items)?;
    Ok(item)
}

pub fn update_anniversary(
    app: &AppHandle,
    id: &str,
    title: String,
    month: u32,
    day: u32,
    calendar: String,
    leap_month: bool,
    start_year: Option<i32>,
) -> Result<Anniversary, String> {
    let valid = validate(title, month, day, calendar, leap_month, start_year)?;
    let mut items = load_anniversaries(app)?;
    let Some(item) = items.iter_mut().find(|entry| entry.id == id) else {
        return Err("anniversary not found".into());
    };
    item.title = valid.title;
    item.month = valid.month;
    item.day = valid.day;
    item.calendar = valid.calendar;
    item.leap_month = valid.leap_month;
    item.start_year = valid.start_year;
    item.updated_at = now_ms();
    let updated = item.clone();
    save_anniversaries(app, &items)?;
    Ok(updated)
}

pub fn delete_anniversary(app: &AppHandle, id: &str) -> Result<(), String> {
    let mut items = load_anniversaries(app)?;
    let before = items.len();
    items.retain(|item| item.id != id);
    if items.len() == before {
        return Err("anniversary not found".into());
    }
    save_anniversaries(app, &items)
}

#[cfg(test)]
mod tests {
    use super::{solar_days_in_month, validate, Anniversary};

    #[test]
    fn anniversary_json_uses_camel_case_fields() {
        let item = Anniversary {
            id: "ann_1".into(),
            title: "生日".into(),
            month: 3,
            day: 12,
            calendar: "solar".into(),
            leap_month: false,
            start_year: Some(1995),
            created_at: 1_700_000_000_000,
            updated_at: 1_700_000_000_001,
        };
        let json = serde_json::to_string(&item).expect("serialize");
        assert!(json.contains("\"leapMonth\":false"));
        assert!(json.contains("\"startYear\":1995"));
        assert!(json.contains("createdAt"));
        assert!(!json.contains("leap_month"));
        let parsed: Anniversary = serde_json::from_str(&json).expect("deserialize");
        assert_eq!(parsed.month, 3);
        assert_eq!(parsed.start_year, Some(1995));
    }

    #[test]
    fn legacy_rows_default_to_solar_without_start_year() {
        let legacy: Anniversary =
            serde_json::from_str(r#"{"id":"a","title":"t","month":1,"day":1,"createdAt":1,"updatedAt":1}"#)
                .expect("legacy");
        assert_eq!(legacy.calendar, "solar");
        assert!(!legacy.leap_month);
        assert_eq!(legacy.start_year, None);
    }

    #[test]
    fn start_year_is_omitted_when_absent() {
        let item = Anniversary {
            id: "a".into(),
            title: "t".into(),
            month: 1,
            day: 1,
            calendar: "solar".into(),
            leap_month: false,
            start_year: None,
            created_at: 1,
            updated_at: 1,
        };
        let json = serde_json::to_string(&item).expect("serialize");
        assert!(!json.contains("startYear"));
    }

    #[test]
    fn rejects_blank_and_overlong_titles() {
        assert!(validate("  ".into(), 1, 1, "solar".into(), false, None).is_err());
        let long = "x".repeat(61);
        assert!(validate(long, 1, 1, "solar".into(), false, None).is_err());
        assert!(validate("ok".into(), 1, 1, "solar".into(), false, None).is_ok());
    }

    #[test]
    fn rejects_unknown_calendar_and_bad_month() {
        assert!(validate("t".into(), 1, 1, "julian".into(), false, None).is_err());
        assert!(validate("t".into(), 13, 1, "solar".into(), false, None).is_err());
        assert!(validate("t".into(), 0, 1, "solar".into(), false, None).is_err());
    }

    #[test]
    fn solar_days_follow_the_calendar_including_february_29() {
        assert_eq!(solar_days_in_month(2, 2024), 29);
        assert_eq!(solar_days_in_month(2, 2026), 28);
        assert_eq!(solar_days_in_month(4, 2026), 30);
        assert_eq!(solar_days_in_month(12, 2026), 31);
        // Feb 29 is accepted so a leap-day birthday can be stored.
        assert!(validate("t".into(), 2, 29, "solar".into(), false, None).is_ok());
        assert!(validate("t".into(), 2, 30, "solar".into(), false, None).is_err());
        assert!(validate("t".into(), 4, 31, "solar".into(), false, None).is_err());
    }

    #[test]
    fn lunar_day_allows_thirty_but_not_thirty_one() {
        assert!(validate("t".into(), 12, 30, "lunar".into(), false, None).is_ok());
        assert!(validate("t".into(), 12, 31, "lunar".into(), false, None).is_err());
    }

    #[test]
    fn leap_month_only_applies_to_lunar_dates() {
        let solar = validate("t".into(), 6, 1, "solar".into(), true, None).expect("solar");
        assert!(!solar.leap_month);
        let lunar = validate("t".into(), 6, 1, "lunar".into(), true, None).expect("lunar");
        assert!(lunar.leap_month);
    }

    #[test]
    fn start_year_must_be_in_the_convertible_range() {
        // 1890 is the library's lower bound; 1889 and 2101 are outside it.
        assert!(validate("t".into(), 1, 1, "solar".into(), false, Some(1889)).is_err());
        assert!(validate("t".into(), 1, 1, "solar".into(), false, Some(2101)).is_err());
        assert!(validate("t".into(), 1, 1, "solar".into(), false, Some(1890)).is_ok());
        assert!(validate("t".into(), 1, 1, "solar".into(), false, Some(2100)).is_ok());
        assert_eq!(
            validate("t".into(), 1, 1, "solar".into(), false, Some(1995))
                .expect("in range")
                .start_year,
            Some(1995)
        );
    }

    #[test]
    fn title_is_trimmed() {
        let valid = validate("  妈妈生日  ".into(), 1, 1, "solar".into(), false, None).expect("ok");
        assert_eq!(valid.title, "妈妈生日");
    }
}
