use std::fs;
use std::path::PathBuf;

use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Manager};

const TODO_FILE: &str = "todos.json";

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Todo {
    pub id: String,
    pub text: String,
    pub done: bool,
    pub created_at: i64,
}

fn todo_path(app: &AppHandle) -> Result<PathBuf, String> {
    let dir = app
        .path()
        .app_data_dir()
        .map_err(|err| format!("resolve app data dir: {err}"))?;
    fs::create_dir_all(&dir).map_err(|err| format!("create app data dir: {err}"))?;
    Ok(dir.join(TODO_FILE))
}

pub fn load_todos(app: &AppHandle) -> Result<Vec<Todo>, String> {
    let path = todo_path(app)?;
    if !path.exists() {
        fs::write(&path, "[]").map_err(|err| format!("create todos file: {err}"))?;
        return Ok(Vec::new());
    }

    let data = fs::read_to_string(&path).map_err(|err| format!("read todos: {err}"))?;
    if data.trim().is_empty() {
        return Ok(Vec::new());
    }

    serde_json::from_str(&data).map_err(|err| format!("parse todos: {err}"))
}

pub fn save_todos(app: &AppHandle, todos: &[Todo]) -> Result<(), String> {
    let path = todo_path(app)?;
    let tmp = path.with_extension("json.tmp");
    let data =
        serde_json::to_string_pretty(todos).map_err(|err| format!("serialize todos: {err}"))?;
    fs::write(&tmp, data).map_err(|err| format!("write todos temp: {err}"))?;
    if path.exists() {
        fs::remove_file(&path).map_err(|err| format!("replace todos: {err}"))?;
    }
    fs::rename(&tmp, &path).map_err(|err| format!("commit todos: {err}"))?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::Todo;

    #[test]
    fn todo_json_uses_camel_case_fields() {
        let todo = Todo {
            id: "a".into(),
            text: "买牛奶".into(),
            done: false,
            created_at: 1_700_000_000_000,
        };
        let json = serde_json::to_string(&todo).expect("serialize");
        assert!(json.contains("createdAt"));
        assert!(!json.contains("created_at"));
        let parsed: Todo = serde_json::from_str(&json).expect("deserialize");
        assert_eq!(parsed.text, "买牛奶");
        assert_eq!(parsed.created_at, 1_700_000_000_000);
    }
}
