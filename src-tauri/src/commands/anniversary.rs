use tauri::AppHandle;

use crate::storage::anniversary_store::{self, Anniversary};

#[tauri::command(async)]
pub fn get_anniversaries(app: AppHandle) -> Result<Vec<Anniversary>, String> {
    anniversary_store::load_anniversaries(&app)
}

// Every mutating command below rewrites anniversaries.json through a temp file
// and a rename, which must not block the main thread.
#[tauri::command(async)]
pub fn create_anniversary(
    app: AppHandle,
    title: String,
    month: u32,
    day: u32,
    calendar: String,
    leap_month: Option<bool>,
    start_year: Option<i32>,
) -> Result<Anniversary, String> {
    anniversary_store::create_anniversary(
        &app,
        title,
        month,
        day,
        calendar,
        leap_month.unwrap_or(false),
        start_year,
    )
}

#[tauri::command(async)]
#[allow(clippy::too_many_arguments)]
pub fn update_anniversary(
    app: AppHandle,
    id: String,
    title: String,
    month: u32,
    day: u32,
    calendar: String,
    leap_month: Option<bool>,
    start_year: Option<i32>,
) -> Result<Anniversary, String> {
    anniversary_store::update_anniversary(
        &app,
        &id,
        title,
        month,
        day,
        calendar,
        leap_month.unwrap_or(false),
        start_year,
    )
}

#[tauri::command(async)]
pub fn delete_anniversary(app: AppHandle, id: String) -> Result<(), String> {
    anniversary_store::delete_anniversary(&app, &id)
}
