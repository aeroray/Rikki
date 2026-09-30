//! Translation.
//!
//! Three sources, none of which needs an API key:
//!
//!  - **Sentences** go to Sogou's Hunyuan endpoint. It is the one the Sogou
//!    translate page itself calls for free text, and it returns a model
//!    translation rather than a phrase-table lookup.
//!  - **The same sentences** are also sent to Pollinations.AI, which runs a
//!    real LLM behind an anonymous tier. Sogou is quick and usually close
//!    enough, but it is a phrase-based model and a whole sentence is where that
//!    shows. The two are deliberately separate commands rather than one that
//!    waits: the machine answer lands in under a second and must not be held
//!    back by an answer that takes five.
//!  - **Words** go to Youdao's public dictionary. Sogou has a dictionary
//!    endpoint too, but it is signed — `s` is a hash of the text plus a
//!    `secretCode` lifted out of the page's initial state — and it is not a
//!    published API, so the secret can rotate without notice and reproducing the
//!    hash means shipping a reverse-engineered constant. Youdao's is public and
//!    returns exactly what a word card needs: US and UK phonetics with matching
//!    audio, part-of-speech definitions, word forms and bilingual examples.
//!
//! The dictionary sits behind `lookup_word`, so swapping the source later is a
//! change to this file and nothing else.
//!
//! This replaces a Baidu integration that required the user to register an app
//! and paste an AppID and secret before the command worked at all.

use serde::Serialize;
use serde_json::Value;
use std::time::Duration;

const MAX_CHARS: usize = 2_000;
const MAX_BYTES: usize = 1024 * 1024;
const TIMEOUT: Duration = Duration::from_secs(30);

/// The LLM path gets a longer ceiling than the phrase lookups.
///
/// `TIMEOUT` was sized for endpoints that answer in well under a second, and
/// 30s is already far more than they ever need. A cold Pollinations call is
/// 5–10s, and the anonymous tier makes callers queue behind one another on top
/// of that, so the same 30s would abort requests that are still making progress.
/// Nothing here is on the critical path — the machine translation is on screen
/// before this even starts — so waiting is always better than timing out.
const LLM_TIMEOUT: Duration = Duration::from_secs(60);

const SOGOU_TRANSLATE: &str = "https://fanyi.sogou.com/api/transpc/hunyuan/translate";
const SOGOU_HOME: &str = "https://fanyi.sogou.com/text";
const YOUDAO_DICT: &str = "https://dict.youdao.com/jsonapi";
const YOUDAO_VOICE: &str = "https://dict.youdao.com/dictvoice";
const POLLINATIONS_CHAT: &str = "https://text.pollinations.ai/openai";

/// The fastest model the anonymous tier offers. A translation does not need a
/// reasoning model, and with one request per 15 seconds the latency is what the
/// user actually feels.
const LLM_MODEL: &str = "openai-fast";

/// Low, because the same text is cached server-side for a while and a
/// translation has one right answer; variety here is noise.
const LLM_TEMPERATURE: f32 = 0.2;

/// What a 402 — the anonymous tier's rate limit — is reported as.
///
/// The body on a 402 is nearly empty, so the status is the only thing to go on,
/// and "wait a few seconds" is a different thing to tell the user than "this
/// failed". The frontend matches on this wording, which is why it is a constant
/// rather than a literal at the one place that produces it.
const LLM_BUSY: &str = "llm busy";

/// Both sites reject requests that do not look like they came from their own page.
const USER_AGENT: &str = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";

#[derive(Debug, Clone, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct Translation {
    pub text: String,
    pub from: String,
    pub to: String,
}

#[derive(Debug, Clone, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct WordDefinition {
    /// The part of speech as the dictionary writes it, e.g. `int.` or `n.`.
    pub part_of_speech: String,
    pub meaning: String,
}

#[derive(Debug, Clone, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct WordForm {
    pub name: String,
    pub value: String,
}

#[derive(Debug, Clone, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct WordExample {
    pub en: String,
    pub zh: String,
}

#[derive(Debug, Clone, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct WordEntry {
    pub headword: String,
    pub us_phone: Option<String>,
    pub uk_phone: Option<String>,
    /// Whether an audio clip exists, so the panel can hide a button that would
    /// do nothing.
    pub has_us_audio: bool,
    pub has_uk_audio: bool,
    pub definitions: Vec<WordDefinition>,
    pub forms: Vec<WordForm>,
    pub examples: Vec<WordExample>,
}

fn client() -> Result<reqwest::Client, String> {
    client_with_timeout(TIMEOUT)
}

/// The same client with a different ceiling, for the one endpoint that is slow
/// by nature rather than by accident.
fn client_with_timeout(timeout: Duration) -> Result<reqwest::Client, String> {
    reqwest::Client::builder()
        .user_agent(USER_AGENT)
        .timeout(timeout)
        .build()
        .map_err(|error| format!("http client: {error}"))
}

/// Reads a response body with a ceiling, so a hostile or broken endpoint cannot
/// make the app allocate without limit.
async fn bounded(response: reqwest::Response) -> Result<Vec<u8>, String> {
    if response
        .content_length()
        .is_some_and(|length| length > MAX_BYTES as u64)
    {
        return Err("response too large".into());
    }
    let mut collected = Vec::new();
    let mut response = response;
    while let Some(chunk) = response
        .chunk()
        .await
        .map_err(|error| format!("read response: {error}"))?
    {
        if collected.len() + chunk.len() > MAX_BYTES {
            return Err("response too large".into());
        }
        collected.extend_from_slice(&chunk);
    }
    Ok(collected)
}

/// Trims the input and caps it, since both endpoints choke on length.
fn prepare(text: &str) -> Result<String, String> {
    let trimmed = text.trim();
    if trimmed.is_empty() {
        return Err("empty".into());
    }
    Ok(trimmed.chars().take(MAX_CHARS).collect())
}

#[tauri::command(async)]
pub async fn translate(text: String, from: String, to: String) -> Result<Translation, String> {
    let text = prepare(&text)?;
    let response = client()?
        .post(SOGOU_TRANSLATE)
        .header("Referer", SOGOU_HOME)
        .header("Origin", "https://fanyi.sogou.com")
        .header("Accept", "application/json, text/plain, */*")
        .form(&[
            ("text", text.as_str()),
            ("from_lang", from.as_str()),
            ("to_lang", to.as_str()),
        ])
        .send()
        .await
        .map_err(|error| format!("translate request: {error}"))?;

    if !response.status().is_success() {
        return Err(format!("translate http {}", response.status().as_u16()));
    }
    let bytes = bounded(response).await?;
    let json: Value =
        serde_json::from_slice(&bytes).map_err(|error| format!("translate response: {error}"))?;
    parse_sogou(&json, &from, &to)
}

fn parse_sogou(json: &Value, from: &str, to: &str) -> Result<Translation, String> {
    if let Some(status) = json.get("status").and_then(Value::as_i64) {
        if status != 0 {
            return Err(format!("translate failed (status {status})"));
        }
    }
    let data = json.get("data").ok_or("translate response has no data")?;
    if let Some(code) = data.get("code").and_then(Value::as_i64) {
        if code != 0 {
            let message = data
                .get("message")
                .and_then(Value::as_str)
                .unwrap_or("translate failed");
            return Err(message.to_string());
        }
    }
    let text = data
        .get("content")
        .and_then(Value::as_str)
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .ok_or("translate returned nothing")?;
    Ok(Translation {
        text: text.to_string(),
        // Sogou echoes what it actually used, which is worth keeping: it does
        // not accept `auto`, so the caller guesses the source and this is the
        // only confirmation that the guess was taken.
        from: data
            .get("from_lang")
            .and_then(Value::as_str)
            .unwrap_or(from)
            .to_string(),
        to: data
            .get("to_lang")
            .and_then(Value::as_str)
            .unwrap_or(to)
            .to_string(),
    })
}

/// A second, LLM-backed translation of a sentence.
///
/// Separate from `translate` rather than folded into it: this one is slow, rate
/// limited, and allowed to fail, and none of that may hold back or take down the
/// machine answer the panel already has. Words never come here — the dictionary
/// card is the better answer for a single word, and the anonymous tier allows
/// only one request every 15 seconds.
#[tauri::command(async)]
pub async fn translate_llm(text: String, from: String, to: String) -> Result<String, String> {
    let text = prepare(&text)?;
    let response = client_with_timeout(LLM_TIMEOUT)?
        .post(POLLINATIONS_CHAT)
        .header("Accept", "application/json")
        .json(&serde_json::json!({
            "model": LLM_MODEL,
            "temperature": LLM_TEMPERATURE,
            "messages": [
                { "role": "system", "content": llm_system_prompt(&from, &to) },
                { "role": "user", "content": text },
            ],
        }))
        .send()
        .await
        .map_err(|error| format!("llm request: {error}"))?;

    if response.status().as_u16() == 402 {
        return Err(LLM_BUSY.into());
    }
    if !response.status().is_success() {
        return Err(format!("llm http {}", response.status().as_u16()));
    }
    let bytes = bounded(response).await?;
    let json: Value =
        serde_json::from_slice(&bytes).map_err(|error| format!("llm response: {error}"))?;
    parse_pollinations(&json)
}

/// The instruction sent as the system message.
///
/// Written in English whichever way the translation goes: one instruction then
/// covers all four targets, and the target is named in it, which is the part the
/// model actually needs. `from` is offered as a hint only — `guessSourceLang`
/// falls back to English for any text without a distinctive script, so the model
/// is told to translate what it reads rather than what it is told.
fn llm_system_prompt(from: &str, to: &str) -> String {
    let target = language_name(to).unwrap_or(to);
    let mut prompt = format!("Translate the text into {target}.");
    if let Some(source) = language_name(from) {
        prompt.push_str(&format!(
            " It is most likely written in {source}, but translate the language it is actually in."
        ));
    }
    prompt.push_str(" Reply with the translation only: no notes, no quotes, no original text.");
    prompt
}

/// The language by name, because the codes here are Sogou's and `zh-CHS` means
/// nothing to a model as the name of a language.
fn language_name(code: &str) -> Option<&'static str> {
    match code {
        "zh-CHS" | "zh" => Some("Chinese"),
        "en" => Some("English"),
        "ja" => Some("Japanese"),
        "ko" => Some("Korean"),
        "th" => Some("Thai"),
        "ru" => Some("Russian"),
        _ => None,
    }
}

/// Reads the answer out of an OpenAI-compatible body.
///
/// Only `choices[0].message.content` is the translation. The message also
/// carries a `reasoning` field holding the model's chain of thought, and the
/// body can carry one at the top level as well; neither is the answer, and
/// neither is ever a fallback for a missing one — a page of reasoning where a
/// translation belongs is worse than saying the call returned nothing.
fn parse_pollinations(json: &Value) -> Result<String, String> {
    json.get("choices")
        .and_then(Value::as_array)
        .and_then(|choices| choices.first())
        .and_then(|choice| choice.get("message"))
        .and_then(|message| message.get("content"))
        .and_then(Value::as_str)
        .map(str::trim)
        .filter(|content| !content.is_empty())
        .map(ToOwned::to_owned)
        .ok_or_else(|| "llm returned nothing".to_string())
}

#[tauri::command(async)]
pub async fn lookup_word(text: String) -> Result<Option<WordEntry>, String> {
    let text = prepare(&text)?;
    let response = client()?
        .get(YOUDAO_DICT)
        .query(&[("q", text.as_str())])
        .send()
        .await
        .map_err(|error| format!("dictionary request: {error}"))?;

    if !response.status().is_success() {
        return Err(format!("dictionary http {}", response.status().as_u16()));
    }
    let bytes = bounded(response).await?;
    // A word with no entry is a normal outcome, not an error: it means the text
    // is a sentence, and the caller falls back to the translator.
    let Ok(json) = serde_json::from_slice::<Value>(&bytes) else {
        return Ok(None);
    };
    Ok(parse_youdao(&json, &text))
}

fn parse_youdao(json: &Value, fallback_headword: &str) -> Option<WordEntry> {
    let word = json.get("ec")?.get("word")?.get(0)?;

    let definitions = word
        .get("trs")
        .and_then(Value::as_array)
        .map(|groups| {
            groups
                .iter()
                .filter_map(|group| group.get("tr")?.as_array())
                .flatten()
                .filter_map(|entry| entry.get("l")?.get("i")?.as_array())
                .flatten()
                .filter_map(Value::as_str)
                .map(split_part_of_speech)
                .collect::<Vec<_>>()
        })
        .unwrap_or_default();

    let forms = word
        .get("wfs")
        .and_then(Value::as_array)
        .map(|items| {
            items
                .iter()
                .filter_map(|item| item.get("wf"))
                .filter_map(|wf| {
                    Some(WordForm {
                        name: wf.get("name")?.as_str()?.to_string(),
                        value: wf.get("value")?.as_str()?.to_string(),
                    })
                })
                .collect::<Vec<_>>()
        })
        .unwrap_or_default();

    let examples = json
        .get("blng_sents_part")
        .and_then(|part| part.get("sentence-pair"))
        .and_then(Value::as_array)
        .map(|pairs| {
            pairs
                .iter()
                .filter_map(|pair| {
                    let en = pair.get("sentence")?.as_str()?.trim();
                    let zh = pair.get("sentence-translation")?.as_str()?.trim();
                    if en.is_empty() || zh.is_empty() {
                        return None;
                    }
                    Some(WordExample {
                        en: en.to_string(),
                        zh: zh.to_string(),
                    })
                })
                .take(3)
                .collect::<Vec<_>>()
        })
        .unwrap_or_default();

    // An entry with nothing to show is not worth rendering.
    if definitions.is_empty() && forms.is_empty() && examples.is_empty() {
        return None;
    }

    let phone = |key: &str| {
        word.get(key)
            .and_then(Value::as_str)
            .map(str::trim)
            .filter(|value| !value.is_empty())
            .map(ToOwned::to_owned)
    };
    let headword = word
        .get("return-phrase")
        .and_then(Value::as_str)
        .unwrap_or(fallback_headword)
        .to_string();

    Some(WordEntry {
        headword,
        us_phone: phone("usphone"),
        uk_phone: phone("ukphone"),
        has_us_audio: word.get("usspeech").is_some_and(|value| !value.is_null()),
        has_uk_audio: word.get("ukspeech").is_some_and(|value| !value.is_null()),
        definitions,
        forms,
        examples,
    })
}

/// Splits `int. 喂，你好` into its part of speech and the meaning.
///
/// The dictionary writes them as one string, and the part of speech is the only
/// structure in it — everything after the first run of letters and a period is
/// prose that may contain anything, including periods.
fn split_part_of_speech(raw: &str) -> WordDefinition {
    let trimmed = raw.trim();
    let head: String = trimmed
        .chars()
        .take_while(|ch| ch.is_ascii_alphabetic() || *ch == '.' || *ch == '&')
        .collect();
    let is_part_of_speech = head.ends_with('.')
        && head.len() <= 12
        && head.chars().any(|ch| ch.is_ascii_alphabetic());
    if is_part_of_speech {
        WordDefinition {
            part_of_speech: head.clone(),
            meaning: trimmed[head.len()..].trim().to_string(),
        }
    } else {
        WordDefinition {
            part_of_speech: String::new(),
            meaning: trimmed.to_string(),
        }
    }
}

/// Fetches a pronunciation clip and returns it base64-encoded.
///
/// The webview has no network access of its own — the CSP allows `self` and the
/// IPC only — so the audio comes back through the same channel as everything
/// else and is played from a data URL.
#[tauri::command(async)]
pub async fn pronounce(text: String, accent: String) -> Result<String, String> {
    let text = prepare(&text)?;
    // 1 is UK, 2 is US, matching the `type` parameter the dictionary page uses.
    let kind = if accent == "uk" { "1" } else { "2" };
    let response = client()?
        .get(YOUDAO_VOICE)
        .query(&[("audio", text.as_str()), ("type", kind)])
        .send()
        .await
        .map_err(|error| format!("pronounce request: {error}"))?;
    if !response.status().is_success() {
        return Err(format!("pronounce http {}", response.status().as_u16()));
    }
    let bytes = bounded(response).await?;
    if bytes.is_empty() {
        return Err("no audio".into());
    }
    Ok(base64(&bytes))
}

fn base64(bytes: &[u8]) -> String {
    const TABLE: &[u8; 64] = b"ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
    let mut out = String::with_capacity(bytes.len().div_ceil(3) * 4);
    for chunk in bytes.chunks(3) {
        let b = [
            chunk[0],
            *chunk.get(1).unwrap_or(&0),
            *chunk.get(2).unwrap_or(&0),
        ];
        let n = ((b[0] as u32) << 16) | ((b[1] as u32) << 8) | b[2] as u32;
        out.push(TABLE[(n >> 18) as usize & 63] as char);
        out.push(TABLE[(n >> 12) as usize & 63] as char);
        out.push(if chunk.len() > 1 {
            TABLE[(n >> 6) as usize & 63] as char
        } else {
            '='
        });
        out.push(if chunk.len() > 2 {
            TABLE[n as usize & 63] as char
        } else {
            '='
        });
    }
    out
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn reads_a_sogou_translation() {
        let json = serde_json::json!({
            "status": 0,
            "data": { "code": 0, "content": "你好", "from_lang": "en", "to_lang": "zh-CHS" }
        });
        let out = parse_sogou(&json, "en", "zh-CHS").expect("translation");
        assert_eq!(out.text, "你好");
        assert_eq!(out.from, "en");
        assert_eq!(out.to, "zh-CHS");
    }

    #[test]
    fn reports_a_sogou_error_instead_of_an_empty_translation() {
        let json = serde_json::json!({
            "status": 0,
            "data": { "code": 1, "message": "不支持的语言" }
        });
        assert_eq!(parse_sogou(&json, "en", "xx").unwrap_err(), "不支持的语言");
    }

    #[test]
    fn reads_a_pollinations_translation() {
        let json = serde_json::json!({
            "choices": [{
                "index": 0,
                "message": { "role": "assistant", "content": " 你好，世界。 " },
                "finish_reason": "stop"
            }]
        });
        assert_eq!(parse_pollinations(&json).unwrap(), "你好，世界。");
    }

    /// The body carries the model's chain of thought beside the answer. It is
    /// not the translation, and it must never be what the panel shows.
    #[test]
    fn ignores_the_pollinations_reasoning_field() {
        let json = serde_json::json!({
            "reasoning": "The user wants this in Chinese, so I should…",
            "choices": [{
                "message": {
                    "role": "assistant",
                    "reasoning": "First I identify the greeting, then…",
                    "content": "你好"
                }
            }]
        });
        assert_eq!(parse_pollinations(&json).unwrap(), "你好");
    }

    /// A message whose only text is the reasoning has no translation in it, and
    /// falling back to the chain of thought would put paragraphs of it on screen.
    #[test]
    fn reports_a_pollinations_answer_with_no_content() {
        let json = serde_json::json!({
            "reasoning": "thinking",
            "choices": [{ "message": { "role": "assistant", "reasoning": "still thinking" } }]
        });
        assert_eq!(
            parse_pollinations(&json).unwrap_err(),
            "llm returned nothing"
        );
    }

    #[test]
    fn reports_a_pollinations_answer_that_is_only_whitespace() {
        let json = serde_json::json!({
            "choices": [{ "message": { "content": "   " } }]
        });
        assert!(parse_pollinations(&json).is_err());
    }

    /// A body with no `choices` at all is what an error payload looks like, and
    /// it has to be reported rather than parsed into an empty translation.
    #[test]
    fn reports_a_pollinations_body_without_choices() {
        let json = serde_json::json!({ "error": "rate limited" });
        assert!(parse_pollinations(&json).is_err());
    }

    #[test]
    fn names_the_target_language_in_the_instruction() {
        let prompt = llm_system_prompt("en", "zh-CHS");
        assert!(prompt.contains("Chinese"), "{prompt}");
        assert!(prompt.contains("English"), "{prompt}");
        // An unknown code still produces a usable instruction rather than a gap.
        assert!(llm_system_prompt("en", "xx").contains("xx"));
    }

    #[test]
    fn reads_a_youdao_word_entry() {
        let json = serde_json::json!({
            "ec": { "word": [{
                "return-phrase": "hello",
                "usphone": "həˈloʊ",
                "ukphone": "həˈləʊ",
                "usspeech": "hello&type=2",
                "ukspeech": "hello&type=1",
                "trs": [{ "tr": [{ "l": { "i": ["int. 喂，你好"] } }] }],
                "wfs": [{ "wf": { "name": "复数", "value": "hellos" } }]
            }]},
            "blng_sents_part": { "sentence-pair": [
                { "sentence": "Hello there.", "sentence-translation": "你好。" }
            ]}
        });
        let entry = parse_youdao(&json, "hello").expect("entry");
        assert_eq!(entry.headword, "hello");
        assert_eq!(entry.us_phone.as_deref(), Some("həˈloʊ"));
        assert_eq!(entry.uk_phone.as_deref(), Some("həˈləʊ"));
        assert!(entry.has_us_audio && entry.has_uk_audio);
        assert_eq!(
            entry.definitions,
            vec![WordDefinition {
                part_of_speech: "int.".into(),
                meaning: "喂，你好".into(),
            }]
        );
        assert_eq!(entry.forms[0].value, "hellos");
        assert_eq!(entry.examples[0].zh, "你好。");
    }

    /// A sentence has no entry, which is how the caller knows to translate it
    /// instead. Returning `Some` with empty fields would render an empty card.
    #[test]
    fn treats_a_sentence_as_having_no_entry() {
        let json = serde_json::json!({ "ec": { "word": [{ "return-phrase": "hi there" }] } });
        assert!(parse_youdao(&json, "hi there").is_none());
    }

    /// The part of speech is the only structure in the string, and meanings
    /// contain periods, so only a leading short token counts as one.
    #[test]
    fn splits_the_part_of_speech_without_eating_the_meaning() {
        let out = split_part_of_speech("n. 招呼，问候。也用于问候语。");
        assert_eq!(out.part_of_speech, "n.");
        assert_eq!(out.meaning, "招呼，问候。也用于问候语。");

        let plain = split_part_of_speech("没有词性的释义");
        assert_eq!(plain.part_of_speech, "");
        assert_eq!(plain.meaning, "没有词性的释义");
    }

    #[test]
    fn encodes_base64_with_padding() {
        assert_eq!(base64(b""), "");
        assert_eq!(base64(b"f"), "Zg==");
        assert_eq!(base64(b"fo"), "Zm8=");
        assert_eq!(base64(b"foo"), "Zm9v");
        assert_eq!(base64(b"foob"), "Zm9vYg==");
        assert_eq!(base64(b"hello world"), "aGVsbG8gd29ybGQ=");
    }

    #[test]
    fn refuses_empty_input() {
        assert!(prepare("   ").is_err());
    }
}
