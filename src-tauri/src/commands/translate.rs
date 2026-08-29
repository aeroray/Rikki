use serde::{Deserialize, Serialize};
use serde_json::Value;
use tauri::AppHandle;

use crate::storage::settings_store;

const MAX_CHARS: usize = 1000;

#[derive(Debug, Clone, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct DictPart {
    pub part: String,
    pub means: Vec<String>,
}

#[derive(Debug, Clone, Serialize, PartialEq)]
pub struct Example {
    pub orig: String,
    pub trans: String,
}

#[derive(Debug, Clone, Serialize, PartialEq)]
pub struct WordForm {
    pub kind: String,
    pub values: Vec<String>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TranslateResponse {
    pub from: String,
    pub to: String,
    pub source_text: String,
    pub translated_text: String,
    pub phonetic: Option<String>,
    pub phonetic_uk: Option<String>,
    pub phonetic_us: Option<String>,
    pub tags: Vec<String>,
    pub forms: Vec<WordForm>,
    pub similar: Vec<String>,
    pub parts: Vec<DictPart>,
    pub sentences: Vec<Example>,
    pub has_dict: bool,
}

#[derive(Debug, Deserialize)]
struct BaiduResponse {
    error_code: Option<Value>,
    error_msg: Option<String>,
    from: Option<String>,
    to: Option<String>,
    trans_result: Option<Vec<BaiduTrans>>,
    dict: Option<Value>,
}

#[derive(Debug, Deserialize)]
struct BaiduTrans {
    src: Option<String>,
    dst: Option<String>,
    dict: Option<Value>,
    sentences: Option<Value>,
}

#[tauri::command]
pub async fn translate(app: AppHandle, text: String, source: String, target: String) -> Result<TranslateResponse, String> {
    let text = text.trim().to_string();
    if text.is_empty() {
        return Err("empty".into());
    }
    if text.chars().count() > MAX_CHARS {
        return Err("too_long".into());
    }

    let settings = settings_store::load_settings(&app)?;
    let app_id = settings.baidu_translate_app_id.trim().to_string();
    let secret = settings.baidu_translate_secret_key.trim().to_string();
    if app_id.is_empty() || secret.is_empty() {
        return Err("not_configured".into());
    }

    let from = to_baidu(&source)?;
    let to = to_baidu(&target)?;
    let endpoint = settings_store::resolved_translate_url(&settings);

    let salt = rand::random::<u32>().to_string();
    let sign_input = format!("{app_id}{text}{salt}{secret}");
    let sign = format!("{:x}", md5::compute(sign_input.as_bytes()));

    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(10))
        .build()
        .map_err(|_| "network".to_string())?;
    let resp = client
        .post(&endpoint)
        .form(&[
            ("q", text.as_str()),
            ("from", from.as_str()),
            ("to", to.as_str()),
            ("appid", app_id.as_str()),
            ("salt", salt.as_str()),
            ("sign", sign.as_str()),
        ])
        .send()
        .await
        .map_err(|_| "network".to_string())?;

    let body = resp.json::<BaiduResponse>().await.map_err(|_| "network".to_string())?;
    if let Some(code) = body.error_code.as_ref() {
        let code = code_string(code);
        if !code.is_empty() && code != "0" && code != "52000" {
            return Err(map_baidu_error(&code, body.error_msg.as_deref()));
        }
    }

    let row = body.trans_result.as_ref().and_then(|rows| rows.first());
    let source_text = row.and_then(|item| item.src.clone()).unwrap_or(text);
    let translated_text = body
        .trans_result
        .as_ref()
        .map(|rows| {
            rows.iter()
                .filter_map(|item| item.dst.as_deref())
                .collect::<Vec<_>>()
                .join("\n")
        })
        .filter(|value| !value.is_empty())
        .ok_or_else(|| "unknown".to_string())?;

    let mut phonetic = None;
    let mut phonetic_uk = None;
    let mut phonetic_us = None;
    let mut tags = Vec::new();
    let mut forms = Vec::new();
    let mut similar = Vec::new();
    let mut parts = Vec::new();
    let mut sentences = Vec::new();
    let dict_value = row.and_then(|item| item.dict.as_ref()).or(body.dict.as_ref());
    if let Some(dict) = dict_value {
        extract_dict(
            dict,
            &mut phonetic,
            &mut phonetic_uk,
            &mut phonetic_us,
            &mut tags,
            &mut forms,
            &mut similar,
            &mut parts,
            &mut sentences,
        );
    }
    if let Some(examples) = row.and_then(|item| item.sentences.as_ref()) {
        extract_sentences(examples, &mut sentences);
    }
    let has_dict = dict_value.is_some()
        || phonetic.is_some()
        || phonetic_uk.is_some()
        || phonetic_us.is_some()
        || !tags.is_empty()
        || !forms.is_empty()
        || !similar.is_empty()
        || !parts.is_empty()
        || !sentences.is_empty();

    Ok(TranslateResponse {
        from: from_baidu(body.from.as_deref().unwrap_or(&from)),
        to: from_baidu(body.to.as_deref().unwrap_or(&to)),
        source_text,
        translated_text,
        phonetic,
        phonetic_uk,
        phonetic_us,
        tags,
        forms,
        similar,
        parts,
        sentences,
        has_dict,
    })
}

fn to_baidu(code: &str) -> Result<String, String> {
    let code = code.trim().to_ascii_lowercase();
    let mapped = match code.as_str() {
        "zh" | "zh-cn" | "cht" | "yue" => "zh",
        "en" => "en",
        "ja" | "jp" => "jp",
        "ko" | "kor" => "kor",
        "fr" | "fra" => "fra",
        "de" => "de",
        "es" | "spa" => "spa",
        "ru" => "ru",
        "th" => "th",
        "vi" | "vie" => "vie",
        "auto" => "auto",
        _ => return Err("lang".into()),
    };
    Ok(mapped.into())
}

fn from_baidu(code: &str) -> String {
    match code.trim().to_ascii_lowercase().as_str() {
        "jp" => "ja".into(),
        "kor" => "ko".into(),
        "fra" => "fr".into(),
        "spa" => "es".into(),
        "vie" => "vi".into(),
        "cht" | "yue" | "zh-cn" => "zh".into(),
        other => other.into(),
    }
}

fn code_string(value: &Value) -> String {
    match value {
        Value::String(text) => text.clone(),
        Value::Number(num) => num.to_string(),
        _ => String::new(),
    }
}

fn map_baidu_error(code: &str, message: Option<&str>) -> String {
    match code {
        "54001" | "52003" | "90107" => "invalid".into(),
        "54003" | "54004" | "54005" => "quota".into(),
        "58001" => "lang".into(),
        "52001" | "52002" => "network".into(),
        _ => message.filter(|text| !text.is_empty()).unwrap_or("unknown").to_string(),
    }
}

fn extract_dict(
    raw: &Value,
    phonetic: &mut Option<String>,
    phonetic_uk: &mut Option<String>,
    phonetic_us: &mut Option<String>,
    tags: &mut Vec<String>,
    forms: &mut Vec<WordForm>,
    similar: &mut Vec<String>,
    parts: &mut Vec<DictPart>,
    sentences: &mut Vec<Example>,
) {
    let value = dict_root(raw);
    if let Some(simple) = value.get("simple_means") {
        collect_phonetics(simple, phonetic, phonetic_uk, phonetic_us);
        collect_tags(simple, tags);
        collect_forms(simple, forms);
        collect_parts(simple, parts);
        collect_word_means(simple, parts);
    }
    collect_phonetics(&value, phonetic, phonetic_uk, phonetic_us);
    collect_parts(&value, parts);
    extract_edict(&value, similar, sentences);
    if let Some(examples) = value.get("sentences") {
        extract_sentences(examples, sentences);
    }
}

fn dict_root(raw: &Value) -> Value {
    let value = parse_maybe_json(raw);
    value
        .get("word_result")
        .cloned()
        .map(|inner| parse_maybe_json(&inner))
        .unwrap_or(value)
}

fn collect_phonetics(
    value: &Value,
    phonetic: &mut Option<String>,
    phonetic_uk: &mut Option<String>,
    phonetic_us: &mut Option<String>,
) {
    if phonetic_uk.is_none() {
        *phonetic_uk = first_string(value, &["ph_en"]);
    }
    if phonetic_us.is_none() {
        *phonetic_us = first_string(value, &["ph_am"]);
    }
    if phonetic.is_none() {
        *phonetic = first_string(value, &["word_symbol", "phone", "ph_other", "ph_en", "ph_am"]);
    }
}

fn collect_tags(value: &Value, out: &mut Vec<String>) {
    let Some(tags) = value.get("tags") else {
        return;
    };
    for key in ["core", "other"] {
        for tag in flatten_strings(tags.get(key).unwrap_or(&Value::Null)) {
            if !tag.is_empty() && !out.iter().any(|item| item == &tag) {
                out.push(tag);
            }
        }
    }
}

fn collect_word_means(value: &Value, parts: &mut Vec<DictPart>) {
    let means = flatten_strings(value.get("word_means").unwrap_or(&Value::Null));
    if means.is_empty() {
        return;
    }
    if parts
        .iter()
        .any(|part| part.means.iter().any(|item| means.contains(item)))
    {
        return;
    }
    parts.push(DictPart {
        part: String::new(),
        means,
    });
}

fn collect_forms(value: &Value, out: &mut Vec<WordForm>) {
    let Some(exchange) = value.get("exchange") else {
        return;
    };
    const KINDS: [(&str, &str); 7] = [
        ("word_pl", "pl"),
        ("word_third", "third"),
        ("word_past", "past"),
        ("word_done", "done"),
        ("word_ing", "ing"),
        ("word_er", "er"),
        ("word_est", "est"),
    ];
    for (key, kind) in KINDS {
        let values = flatten_strings(exchange.get(key).unwrap_or(&Value::Null));
        if !values.is_empty() && !out.iter().any(|item| item.kind == kind) {
            out.push(WordForm {
                kind: kind.into(),
                values,
            });
        }
    }
}

fn extract_edict(value: &Value, similar: &mut Vec<String>, sentences: &mut Vec<Example>) {
    let Some(edict) = value.get("edict") else {
        return;
    };
    if edict.as_str().is_some_and(|text| text.is_empty()) {
        return;
    }
    let edict = parse_maybe_json(edict);
    let items = edict.get("item").cloned().unwrap_or(edict);
    for item in value_items(&items) {
        for group in value_items(item.get("tr_group").unwrap_or(&Value::Null)) {
            for word in flatten_strings(group.get("similar_word").unwrap_or(&Value::Null)) {
                if !word.is_empty() && !similar.iter().any(|item| item == &word) {
                    similar.push(word);
                }
            }
            let defs = flatten_strings(group.get("tr").unwrap_or(&Value::Null));
            let examples = flatten_strings(group.get("example").unwrap_or(&Value::Null));
            for example in examples {
                let trans = defs.first().cloned().unwrap_or_default();
                if sentences.iter().any(|row| row.orig == example) {
                    continue;
                }
                sentences.push(Example {
                    orig: example,
                    trans,
                });
            }
        }
    }
}

fn value_items(value: &Value) -> Vec<Value> {
    match value {
        Value::Array(items) => items.clone(),
        Value::Object(_) => vec![value.clone()],
        _ => Vec::new(),
    }
}

fn parse_maybe_json(raw: &Value) -> Value {
    match raw {
        Value::String(text) => serde_json::from_str(text).unwrap_or_else(|_| raw.clone()),
        Value::Array(items) => items.first().map(parse_maybe_json).unwrap_or_else(|| raw.clone()),
        other => other.clone(),
    }
}

fn first_string(value: &Value, keys: &[&str]) -> Option<String> {
    match value {
        Value::Object(map) => {
            for key in keys {
                if let Some(text) = map
                    .get(*key)
                    .and_then(Value::as_str)
                    .map(str::trim)
                    .filter(|item| !item.is_empty())
                {
                    return Some(text.to_string());
                }
            }
            for nested in map.values() {
                if let Some(found) = first_string(nested, keys) {
                    return Some(found);
                }
            }
            None
        }
        Value::Array(items) => items.iter().find_map(|item| first_string(item, keys)),
        _ => None,
    }
}

fn collect_parts(value: &Value, out: &mut Vec<DictPart>) {
    match value {
        Value::Array(items) => {
            for item in items {
                if item.get("part").is_some() || item.get("part_name").is_some() || item.get("means").is_some() {
                    push_part(item, out);
                } else {
                    collect_parts(item, out);
                }
            }
        }
        Value::Object(map) => {
            if map.contains_key("part") || map.contains_key("part_name") || map.contains_key("means") {
                push_part(value, out);
            }
            if let Some(parts) = map.get("parts") {
                collect_parts(parts, out);
            }
            if let Some(symbols) = map.get("symbols") {
                collect_parts(symbols, out);
            }
        }
        _ => {}
    }
}

fn push_part(value: &Value, out: &mut Vec<DictPart>) {
    let part = value
        .get("part")
        .or_else(|| value.get("part_name"))
        .and_then(Value::as_str)
        .unwrap_or("")
        .trim()
        .to_string();
    let means = value.get("means").map(flatten_strings).unwrap_or_default();
    if part.is_empty() && means.is_empty() {
        return;
    }
    if out.iter().any(|item| item.part == part && item.means == means) {
        return;
    }
    out.push(DictPart { part, means });
}

fn extract_sentences(value: &Value, out: &mut Vec<Example>) {
    let value = parse_maybe_json(value);
    let items = match &value {
        Value::Array(items) => items.clone(),
        Value::Object(_) => vec![value],
        _ => return,
    };
    for item in items {
        let orig = item
            .get("orig")
            .or_else(|| item.get("en"))
            .or_else(|| item.get("src"))
            .and_then(Value::as_str)
            .unwrap_or("")
            .trim()
            .to_string();
        let trans = item
            .get("trans")
            .or_else(|| item.get("zh"))
            .or_else(|| item.get("dst"))
            .and_then(Value::as_str)
            .unwrap_or("")
            .trim()
            .to_string();
        if orig.is_empty() && trans.is_empty() {
            continue;
        }
        if out.iter().any(|example| example.orig == orig && example.trans == trans) {
            continue;
        }
        out.push(Example { orig, trans });
    }
}

fn flatten_strings(value: &Value) -> Vec<String> {
    match value {
        Value::String(text) => {
            let trimmed = text.trim();
            if trimmed.is_empty() {
                Vec::new()
            } else {
                vec![trimmed.to_string()]
            }
        }
        Value::Array(items) => items.iter().flat_map(flatten_strings).collect(),
        Value::Object(map) => {
            if let Some(text) = map
                .get("text")
                .or_else(|| map.get("word_mean"))
                .and_then(Value::as_str)
                .map(str::trim)
                .filter(|item| !item.is_empty())
            {
                let mut out = vec![text.to_string()];
                if let Some(means) = map.get("means") {
                    out.extend(flatten_strings(means));
                }
                out
            } else if let Some(means) = map.get("means") {
                flatten_strings(means)
            } else {
                Vec::new()
            }
        }
        _ => Vec::new(),
    }
}

#[cfg(test)]
mod tests {
    use super::{
        extract_dict, from_baidu, to_baidu, DictPart, Example, WordForm,
    };
    use serde_json::json;

    #[test]
    fn maps_iso_codes_to_baidu() {
        assert_eq!(to_baidu("ja").unwrap(), "jp");
        assert_eq!(to_baidu("ko").unwrap(), "kor");
        assert_eq!(to_baidu("fr").unwrap(), "fra");
        assert_eq!(to_baidu("auto").unwrap(), "auto");
    }

    #[test]
    fn maps_baidu_codes_to_iso() {
        assert_eq!(from_baidu("jp"), "ja");
        assert_eq!(from_baidu("kor"), "ko");
        assert_eq!(from_baidu("zh"), "zh");
    }

    #[test]
    fn extracts_nested_word_result_dict() {
        let dict = json!({
            "lang": "1",
            "word_result": {
                "edict": {
                    "item": [{
                        "pos": "noun",
                        "tr_group": [{
                            "tr": ["an expression of greeting"],
                            "example": ["every morning they exchanged polite hellos"],
                            "similar_word": ["hullo", "hi"]
                        }]
                    }],
                    "word": "hello"
                },
                "simple_means": {
                    "word_name": "hello",
                    "word_means": ["哈罗，喂，你好"],
                    "tags": { "core": ["高考", "CET4"], "other": [""] },
                    "exchange": { "word_pl": ["hellos"] },
                    "symbols": [{
                        "ph_en": "həˈləʊ",
                        "ph_am": "həˈloʊ",
                        "parts": [{ "part": "int./n.", "means": ["哈罗，喂，你好"] }]
                    }]
                }
            }
        });
        let mut phonetic = None;
        let mut phonetic_uk = None;
        let mut phonetic_us = None;
        let mut tags = Vec::new();
        let mut forms = Vec::new();
        let mut similar = Vec::new();
        let mut parts = Vec::new();
        let mut sentences = Vec::new();
        extract_dict(
            &dict,
            &mut phonetic,
            &mut phonetic_uk,
            &mut phonetic_us,
            &mut tags,
            &mut forms,
            &mut similar,
            &mut parts,
            &mut sentences,
        );
        assert_eq!(phonetic_uk.as_deref(), Some("həˈləʊ"));
        assert_eq!(phonetic_us.as_deref(), Some("həˈloʊ"));
        assert!(tags.contains(&"高考".into()));
        assert!(tags.contains(&"CET4".into()));
        assert_eq!(
            forms,
            vec![WordForm {
                kind: "pl".into(),
                values: vec!["hellos".into()]
            }]
        );
        assert_eq!(similar, vec!["hullo".to_string(), "hi".into()]);
        assert!(parts.iter().any(|part: &DictPart| part.part == "int./n."));
        assert!(sentences.iter().any(|row: &Example| row.orig.contains("exchanged")));
    }

    #[test]
    fn extracts_dict_when_wrapped_as_json_string() {
        let inner = serde_json::json!({
            "word_result": {
                "simple_means": {
                    "symbols": [{
                        "ph_en": "test",
                        "ph_am": "test",
                        "parts": [{ "part": "n.", "means": ["测试"] }]
                    }]
                }
            }
        });
        let dict = serde_json::Value::String(inner.to_string());
        let mut phonetic = None;
        let mut phonetic_uk = None;
        let mut phonetic_us = None;
        let mut tags = Vec::new();
        let mut forms = Vec::new();
        let mut similar = Vec::new();
        let mut parts = Vec::new();
        let mut sentences = Vec::new();
        extract_dict(
            &dict,
            &mut phonetic,
            &mut phonetic_uk,
            &mut phonetic_us,
            &mut tags,
            &mut forms,
            &mut similar,
            &mut parts,
            &mut sentences,
        );
        assert_eq!(phonetic_uk.as_deref(), Some("test"));
        assert!(parts.iter().any(|part| part.part == "n."));
    }
}
