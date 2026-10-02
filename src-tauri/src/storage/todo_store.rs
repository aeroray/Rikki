use std::fs;
use std::path::PathBuf;

use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Manager};

use crate::storage::json_file;

const TODO_FILE: &str = "todos.json";

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Todo {
    pub id: String,
    pub text: String,
    pub done: bool,
    pub created_at: i64,
    /// The single label this todo carries, or empty for none.
    ///
    /// `default` is load-bearing rather than tidy: `read_json` treats a
    /// deserialize failure as a corrupt file and moves it aside, so a missing
    /// field here would not degrade to "no tags" — it would throw away every todo
    /// the user had the first time they opened a build with this field.
    #[serde(default)]
    pub tag: String,
}

/// Public within the crate so an import can replace this file in the same commit
/// as the others it holds.
pub(crate) fn todo_path(app: &AppHandle) -> Result<PathBuf, String> {
    let dir = app
        .path()
        .app_data_dir()
        .map_err(|err| format!("resolve app data dir: {err}"))?;
    fs::create_dir_all(&dir).map_err(|err| format!("create app data dir: {err}"))?;
    Ok(dir.join(TODO_FILE))
}

pub fn load_todos(app: &AppHandle) -> Result<Vec<Todo>, String> {
    let path = todo_path(app)?;
    Ok(json_file::read_json::<Vec<Todo>>(&path)?.unwrap_or_default())
}

pub fn save_todos(app: &AppHandle, todos: &[Todo]) -> Result<(), String> {
    json_file::write_json(&todo_path(app)?, &todos)
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
            tag: "购物".into(),
        };
        let json = serde_json::to_string(&todo).expect("serialize");
        assert!(json.contains("createdAt"));
        assert!(!json.contains("created_at"));
        let parsed: Todo = serde_json::from_str(&json).expect("deserialize");
        assert_eq!(parsed.text, "买牛奶");
        assert_eq!(parsed.created_at, 1_700_000_000_000);
        assert_eq!(parsed.tag, "购物");
    }

    /// A file written before tags existed has to keep loading.
    ///
    /// This is not a compatibility nicety: `read_json` moves a file it cannot
    /// parse aside as corrupt, so a required `tag` would have destroyed the
    /// user's whole list on the first launch after the upgrade.
    #[test]
    fn a_todo_without_a_tag_still_reads() {
        let parsed: Todo =
            serde_json::from_str(r#"{"id":"a","text":"买牛奶","done":false,"createdAt":1}"#)
                .expect("deserialize");
        assert_eq!(parsed.text, "买牛奶");
        assert!(parsed.tag.is_empty());
    }
}
