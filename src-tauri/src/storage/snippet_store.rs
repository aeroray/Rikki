use std::fs;
use std::path::PathBuf;
use std::time::{SystemTime, UNIX_EPOCH};

use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Manager};

use crate::storage::json_file;

const SNIPPET_FILE: &str = "snippets.json";

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Snippet {
    pub id: String,
    pub title: String,
    pub content: String,
    pub keyword: String,
    pub tags: Vec<String>,
    #[serde(default)]
    pub sensitive: bool,
    pub created_at: i64,
    pub updated_at: i64,
}

/// Public within the crate so a backup can replace this file in the same commit
/// as the others it holds.
pub(crate) fn snippet_path(app: &AppHandle) -> Result<PathBuf, String> {
    let dir = app
        .path()
        .app_data_dir()
        .map_err(|err| format!("resolve app data dir: {err}"))?;
    fs::create_dir_all(&dir).map_err(|err| format!("create app data dir: {err}"))?;
    Ok(dir.join(SNIPPET_FILE))
}

fn now_ms() -> i64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|duration| duration.as_millis() as i64)
        .unwrap_or(0)
}

fn seed_snippets() -> Vec<Snippet> {
    let created_at = now_ms();
    vec![
        Snippet {
            id: "snp_addr".into(),
            title: "个人地址".into(),
            content: "北京市朝阳区建国路88号 100022".into(),
            keyword: "addr".into(),
            tags: vec!["办公".into(), "快递".into()],
            sensitive: false,
            created_at,
            updated_at: created_at,
        },
        Snippet {
            id: "snp_git".into(),
            title: "Git 提交模板".into(),
            content: "feat: 实现了用户登录功能\n\n- 新增登录接口\n- 新增 Token 验证".into(),
            keyword: "gitcommit".into(),
            tags: vec!["代码".into()],
            sensitive: false,
            created_at,
            updated_at: created_at,
        },
        Snippet {
            id: "snp_sign".into(),
            title: "邮箱签名".into(),
            content: "---\n王小明 | 高级工程师\n📧 wangxm@rikki.app\n📱 138-0000-0000".into(),
            keyword: "sign".into(),
            tags: vec!["办公".into()],
            sensitive: false,
            created_at,
            updated_at: created_at,
        },
        Snippet {
            id: "snp_now".into(),
            title: "当前时间".into(),
            content: "{{date}} {{time}}".into(),
            keyword: "now".into(),
            tags: vec!["模板".into()],
            sensitive: false,
            created_at,
            updated_at: created_at,
        },
    ]
}

pub fn load_snippets(app: &AppHandle) -> Result<Vec<Snippet>, String> {
    let path = snippet_path(app)?;
    match json_file::read_json::<Vec<Snippet>>(&path)? {
        Some(snippets) => Ok(snippets),
        None => {
            let seeds = seed_snippets();
            save_snippets(app, &seeds)?;
            Ok(seeds)
        }
    }
}

pub fn save_snippets(app: &AppHandle, snippets: &[Snippet]) -> Result<(), String> {
    json_file::write_json(&snippet_path(app)?, &snippets)
}

pub fn create_snippet(
    app: &AppHandle,
    title: String,
    content: String,
    keyword: Option<String>,
    sensitive: Option<bool>,
) -> Result<Snippet, String> {
    let title = title.trim().to_string();
    let content = content.trim().to_string();
    if title.is_empty() {
        return Err("title is required".into());
    }
    if content.is_empty() {
        return Err("content is required".into());
    }

    let created_at = now_ms();
    let snippet = Snippet {
        // The millisecond clock alone can repeat when two snippets are created
        // back to back, which would hand Svelte two rows with the same key.
        id: format!("snp_{created_at}_{:04x}", rand::random::<u16>()),
        title,
        content,
        keyword: keyword.unwrap_or_default().trim().to_string(),
        tags: Vec::new(),
        sensitive: sensitive.unwrap_or(false),
        created_at,
        updated_at: created_at,
    };

    let mut snippets = load_snippets(app)?;
    snippets.insert(0, snippet.clone());
    save_snippets(app, &snippets)?;
    Ok(snippet)
}

pub fn delete_snippet(app: &AppHandle, id: &str) -> Result<(), String> {
    let mut snippets = load_snippets(app)?;
    let before = snippets.len();
    snippets.retain(|snippet| snippet.id != id);
    if snippets.len() == before {
        return Err("snippet not found".into());
    }
    save_snippets(app, &snippets)
}

pub fn update_snippet(
    app: &AppHandle,
    id: &str,
    title: String,
    content: String,
    keyword: Option<String>,
    sensitive: Option<bool>,
) -> Result<Snippet, String> {
    let title = title.trim().to_string();
    let content = content.trim().to_string();
    if title.is_empty() {
        return Err("title is required".into());
    }
    if content.is_empty() {
        return Err("content is required".into());
    }

    let mut snippets = load_snippets(app)?;
    let Some(snippet) = snippets.iter_mut().find(|item| item.id == id) else {
        return Err("snippet not found".into());
    };
    snippet.title = title;
    snippet.content = content;
    if let Some(keyword) = keyword {
        snippet.keyword = keyword.trim().to_string();
    }
    if let Some(sensitive) = sensitive {
        snippet.sensitive = sensitive;
    }
    snippet.updated_at = now_ms();
    let updated = snippet.clone();
    save_snippets(app, &snippets)?;
    Ok(updated)
}

#[cfg(test)]
mod tests {
    use super::Snippet;

    #[test]
    fn snippet_json_uses_camel_case_fields() {
        let snippet = Snippet {
            id: "snp_1".into(),
            title: "地址".into(),
            content: "北京".into(),
            keyword: "addr".into(),
            tags: vec!["办公".into()],
            sensitive: true,
            created_at: 1_700_000_000_000,
            updated_at: 1_700_000_000_001,
        };
        let json = serde_json::to_string(&snippet).expect("serialize");
        assert!(json.contains("createdAt"));
        assert!(json.contains("updatedAt"));
        assert!(json.contains("sensitive"));
        assert!(!json.contains("created_at"));
        let parsed: Snippet = serde_json::from_str(&json).expect("deserialize");
        assert_eq!(parsed.keyword, "addr");
        assert!(parsed.sensitive);
        let legacy: Snippet = serde_json::from_str(
            r#"{"id":"x","title":"t","content":"c","keyword":"","tags":[],"createdAt":1,"updatedAt":1}"#,
        )
        .expect("legacy");
        assert!(!legacy.sensitive);
    }
}
