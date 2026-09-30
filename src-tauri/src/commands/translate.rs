//! Translation.
//!
//! One provider: Youdao. Nothing here needs an API key, and there is no second
//! service to fall back to — a call either answers or it fails, and the panel
//! says so.
//!
//!  - **Sentences** go to the streaming endpoint behind Youdao's own translate
//!    page (`dict-trans.youdao.com`). It is the fast half of the pair: it
//!    answers in well under a second and its text is what the panel shows first.
//!  - **The same sentences** are also sent to Youdao's LLM endpoint
//!    (`luna-ai.youdao.com`), which streams. The two are deliberately separate
//!    commands rather than one that waits, because the fast answer must not be
//!    held back by an answer that takes several seconds, and because the slow
//!    one is allowed to fail on its own.
//!  - **Words** go to Youdao's public dictionary. It returns exactly what a word
//!    card needs: US and UK phonetics with matching audio, part-of-speech
//!    definitions, word forms and bilingual examples. Words never reach either
//!    sentence endpoint — a dictionary card is the better answer for a single
//!    word, and it costs no quota.
//!
//! Neither sentence endpoint is published or documented, and both are signed
//! with a secret lifted out of the site's own JavaScript. The two secrets are
//! the constants below, and they are the whole of the coupling: everything else
//! in this file is derived from the request shapes those bundles build.
//!
//! The dictionary sits behind `lookup_word`, so swapping the source later is a
//! change to this file and nothing else.
//!
//! This replaces a Baidu integration that required the user to register an app
//! and paste an AppID and secret before the command worked at all, and then a
//! three-provider version (Sogou for the fast half, Pollinations for the slow
//! one) that could not be kept working as those two changed under it.

use serde::Serialize;
use serde_json::Value;
use std::time::{Duration, SystemTime, UNIX_EPOCH};
use tauri::Emitter;

const MAX_CHARS: usize = 2_000;
const MAX_BYTES: usize = 1024 * 1024;
const TIMEOUT: Duration = Duration::from_secs(30);

/// The LLM path gets a longer ceiling than the other two.
///
/// `TIMEOUT` was sized for endpoints that answer in well under a second, and
/// 30s is already far more than they ever need. The LLM answers as it goes, and
/// a long paragraph can take ten seconds to finish; the same 30s would abort
/// requests that are still making progress. Nothing here is on the critical
/// path — the fast translation is on screen before this even starts — so waiting
/// is always better than timing out.
///
/// This is a ceiling on the whole call including the body read, so it is also
/// what stops a stream that goes quiet without closing from hanging forever.
const LLM_TIMEOUT: Duration = Duration::from_secs(60);

const YOUDAO_DICT: &str = "https://dict.youdao.com/jsonapi";
const YOUDAO_VOICE: &str = "https://dict.youdao.com/dictvoice";
const YOUDAO_TEXT_KEY: &str = "https://dict-trans.youdao.com/translate/key";
const YOUDAO_TEXT_STREAM: &str = "https://dict-trans.youdao.com/webtranslate/sse";
const YOUDAO_LLM_SECRET: &str = "https://luna-ai.youdao.com/translate_llm/secret";
const YOUDAO_LLM_CHAT: &str = "https://luna-ai.youdao.com/translate_llm/v3/chat";

/// Signs the request for the fast sentence endpoint's session secret.
///
/// Read out of the translate site's own JavaScript bundle
/// (`translation-website/1.0.7/js/app.5a9933f2.js`, module 34917, where it is
/// the third argument to the key request). Youdao rotates these whenever it
/// ships a new version, and a rotated secret is not reported as such: measured
/// against the live endpoint, a wrong one answers
/// `{"code":403,"msg":"签名验证失败"}`. **This constant is the one place to
/// update when that happens** — it is deliberately not duplicated at the call
/// site.
const YOUDAO_TEXT_KEY_SECRET: &str = "kSy5gtKA4yRUxAVPJPrdYKZ0jBKyd3t1";

/// Signs the request for the LLM endpoint's session secret.
///
/// Same origin and same caveat as [`YOUDAO_TEXT_KEY_SECRET`]: read out of the
/// bundle, rotated on release, and answered with the same measured
/// `{"code":403,"msg":"签名验证失败"}` when it is wrong. Updated in this one
/// place. The secret it returns is what signs the actual translation, so this
/// key is only ever used on the secret request itself.
const YOUDAO_LLM_SECRET_KEY: &str = "EZAmCfVOH2CrBGMtPrtIPUzyv3bheLdk";

/// The `keyid`s the four requests name.
///
/// The session-secret request and the translation request behind it use
/// different ids for the same account, so each pair is two constants rather
/// than one, and the fast and AI paths do not share either.
const TEXT_KEY_ID: &str = "translate-webmain-key-getter";
const TEXT_STREAM_KEY_ID: &str = "translate-webfanyi-webmain";
const LLM_SECRET_KEY_ID: &str = "ai-translate-llm-pre";
const LLM_CHAT_KEY_ID: &str = "ai-translate-llm";

/// The name of the Tauri event carrying one slice of the LLM answer.
///
/// Payload is [`LlmDelta`]. Deltas are for the seconds before the command
/// returns, not a second source of truth: the return value is the whole answer
/// and is what the caller ends up showing.
const LLM_DELTA_EVENT: &str = "translate-llm-delta";

/// Both sites reject requests that do not look like they came from their own page.
const USER_AGENT: &str = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";

const REFERER: &str = "https://fanyi.youdao.com/";
const ORIGIN: &str = "https://fanyi.youdao.com";

#[derive(Debug, Clone, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct Translation {
    pub text: String,
    pub from: String,
    pub to: String,
}

/// One slice of a streamed LLM answer.
///
/// `stream` is the caller's own id for the call it made. It is not decoration:
/// a superseded call keeps streaming for seconds after the panel stopped
/// waiting for it, and without something to match on its deltas would be
/// appended to the answer that replaced it.
#[derive(Debug, Clone, Serialize, PartialEq)]
pub struct LlmDelta {
    pub stream: String,
    pub delta: String,
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

fn field(name: &str, value: impl Into<String>) -> (String, String) {
    (name.to_string(), value.into())
}

fn md5_hex(input: &str) -> String {
    format!("{:x}", md5::compute(input.as_bytes()))
}

/// Milliseconds since the epoch, which is what both signatures timestamp with.
fn mystic_time() -> u128 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|elapsed| elapsed.as_millis())
        .unwrap_or_default()
}

/// A fresh `yduuid`.
///
/// The value is never checked against anything, so the only requirement is that
/// it looks like a UUID; the version and variant bits are set anyway so that it
/// is one by shape and not just by punctuation.
fn uuid() -> String {
    let mut bytes = [0u8; 16];
    bytes[..8].copy_from_slice(&rand::random::<u64>().to_be_bytes());
    bytes[8..].copy_from_slice(&rand::random::<u64>().to_be_bytes());
    bytes[6] = (bytes[6] & 0x0f) | 0x40;
    bytes[8] = (bytes[8] & 0x3f) | 0x80;
    let hex: String = bytes.iter().map(|byte| format!("{byte:02x}")).collect();
    format!(
        "{}-{}-{}-{}-{}",
        &hex[0..8],
        &hex[8..12],
        &hex[12..16],
        &hex[16..20],
        &hex[20..32]
    )
}

/// The field names a signature covers, in the order the site sorts them.
fn signed_names(fields: &[(String, String)]) -> Vec<&str> {
    let mut names: Vec<&str> = fields
        .iter()
        .filter(|(_, value)| !value.is_empty())
        .map(|(name, _)| name.as_str())
        .collect();
    names.sort_unstable();
    names
}

/// The exact string the signature is the MD5 of.
///
/// Separate from [`sign`] because this, not the hash, is the part that changes
/// when a field is added, renamed or revalued — and unlike a hash it can be read
/// in a test and compared against what the endpoint was measured with.
fn signature_body(fields: &[(String, String)], secret: &str) -> String {
    let mut body = signed_names(fields)
        .iter()
        .map(|name| {
            let value = fields
                .iter()
                .find(|(key, _)| key == name)
                .map(|(_, value)| value.as_str())
                .unwrap_or_default();
            format!("{name}={value}")
        })
        .collect::<Vec<_>>()
        .join("&");
    body.push_str("&key=");
    body.push_str(secret);
    body
}

/// The signature both Youdao endpoints ask for, and the field list that goes
/// with it.
///
/// This is the site's own `genSign`: sort the field names, drop the empty ones,
/// join `name=value` with `&`, then append the secret under the name `key` and
/// MD5 the lot. `pointParam` is the same list of names, and both travel with the
/// request — the server recomputes the hash from `pointParam`, so a field that
/// is signed but not listed, or listed but not signed, is rejected rather than
/// ignored.
fn sign(fields: &[(String, String)], secret: &str) -> (String, String) {
    let mut point_param = signed_names(fields).join(",");
    point_param.push_str(",key");
    (md5_hex(&signature_body(fields, secret)), point_param)
}

/// `encodeURIComponent`, which is what the site applies to the text before it
/// puts it in the form.
///
/// The unreserved set is JavaScript's rather than the RFC 3986 one — `!'()*`
/// survive here — and the signature covers the encoded form, so the difference
/// is not cosmetic.
fn encode_uri_component(value: &str) -> String {
    let mut out = String::with_capacity(value.len());
    for byte in value.as_bytes() {
        match byte {
            b'A'..=b'Z'
            | b'a'..=b'z'
            | b'0'..=b'9'
            | b'-'
            | b'_'
            | b'.'
            | b'!'
            | b'~'
            | b'*'
            | b'\''
            | b'('
            | b')' => out.push(*byte as char),
            _ => out.push_str(&format!("%{byte:02X}")),
        }
    }
    out
}

fn boundary() -> String {
    format!("----RikkiFormBoundary{:016x}", rand::random::<u64>())
}

/// A `multipart/form-data` body, assembled by hand.
///
/// `reqwest`'s `multipart` feature is not enabled in this crate, and the field
/// set cannot be delegated anyway: the signature covers every field, so the
/// bytes that go on the wire have to be exactly the ones that were signed.
fn multipart_body(fields: &[(String, String)], boundary: &str) -> Vec<u8> {
    let mut body = Vec::new();
    for (name, value) in fields {
        if value.is_empty() {
            continue;
        }
        body.extend_from_slice(
            format!("--{boundary}\r\nContent-Disposition: form-data; name=\"{name}\"\r\n\r\n{value}\r\n")
                .as_bytes(),
        );
    }
    body.extend_from_slice(format!("--{boundary}--\r\n").as_bytes());
    body
}

/// The query string the site builds by hand: `name=value` pairs joined by `&`,
/// with nothing percent-encoded, because every value it sends is already
/// URL-safe.
fn query_string(fields: &[(String, String)]) -> String {
    fields
        .iter()
        .map(|(name, value)| format!("{name}={value}"))
        .collect::<Vec<_>>()
        .join("&")
}

/// Posts a signed `multipart/form-data` request.
///
/// Both translation endpoints take the same shape: every field is signed, the
/// signature and the field list travel as two more fields, and the body is form
/// data rather than JSON.
async fn post_signed(
    client: &reqwest::Client,
    url: &str,
    mut fields: Vec<(String, String)>,
    secret: &str,
) -> Result<reqwest::Response, String> {
    let (signature, point_param) = sign(&fields, secret);
    fields.push(field("sign", signature));
    fields.push(field("pointParam", point_param));
    let boundary = boundary();
    client
        .post(url)
        .header(
            "Content-Type",
            format!("multipart/form-data; boundary={boundary}"),
        )
        .header("Referer", REFERER)
        .header("Origin", ORIGIN)
        .header("Accept", "text/event-stream")
        .body(multipart_body(&fields, &boundary))
        .send()
        .await
        .map_err(|error| format!("translate request: {error}"))
}

/// The short-lived credentials both streaming endpoints want.
///
/// The static secrets above only sign the request *for* these; the real request
/// has to be signed with the per-session `secret`.
struct Session {
    token: String,
    secret: String,
}

fn read_session(json: &Value) -> Result<Session, String> {
    if let Some(code) = json.get("code").and_then(Value::as_i64) {
        if code != 0 {
            let message = json
                .get("msg")
                .and_then(Value::as_str)
                .unwrap_or("key request failed");
            return Err(message.to_string());
        }
    }
    let data = json.get("data").ok_or("key response has no data")?;
    let token = data
        .get("token")
        .and_then(Value::as_str)
        .ok_or("key response has no token")?;
    let secret = data
        .get("secretKey")
        .and_then(Value::as_str)
        .ok_or("key response has no secretKey")?;
    Ok(Session {
        token: token.to_string(),
        secret: secret.to_string(),
    })
}

/// One dispatched `text/event-stream` event.
#[derive(Debug, Default, Clone, PartialEq)]
struct SseEvent {
    /// The `event:` field, empty when the stream did not name one.
    name: String,
    /// The `data:` field, with multi-line payloads joined by newlines.
    data: String,
}

/// Where the blank line that ends an event is, and where the next one starts.
///
/// `\r\n`, `\n` and a lone `\r` all end a line, and which one arrives depends on
/// the server and on any proxy in between. A trailing `\r` with nothing after it
/// is left alone: it may still turn out to be the first half of a `\r\n`.
fn blank_line(bytes: &[u8]) -> Option<(usize, usize)> {
    let mut start = 0;
    while start < bytes.len() {
        let mut end = start;
        while end < bytes.len() && bytes[end] != b'\n' && bytes[end] != b'\r' {
            end += 1;
        }
        if end == bytes.len() {
            return None;
        }
        let mut next = end + 1;
        if bytes[end] == b'\r' {
            if next == bytes.len() {
                return None;
            }
            if bytes[next] == b'\n' {
                next += 1;
            }
        }
        if end == start {
            return Some((start, next));
        }
        start = next;
    }
    None
}

/// Reads the `event:` and `data:` fields out of one event's body.
fn parse_event(body: &[u8]) -> SseEvent {
    let text = String::from_utf8_lossy(body);
    let mut event = SseEvent::default();
    let mut seen_data = false;
    // Splitting on either terminator leaves an empty fragment between the two
    // halves of a `\r\n`; no field name matches an empty line, so it is skipped.
    for line in text.split(|ch| ch == '\n' || ch == '\r') {
        if let Some(rest) = line.strip_prefix("data:") {
            if seen_data {
                event.data.push('\n');
            }
            seen_data = true;
            event.data.push_str(rest.strip_prefix(' ').unwrap_or(rest));
        } else if let Some(rest) = line.strip_prefix("event:") {
            event.name = rest.trim_start().to_string();
        }
    }
    event
}

/// A `text/event-stream` reader that survives chunk boundaries.
///
/// Bytes are buffered until a blank line completes an event, because a delta
/// straddling two reads is the normal case on a socket and not an edge case: a
/// parser that treats one read as one event drops exactly the text that was
/// split, and the loss is invisible — the translation simply comes back with a
/// word missing.
#[derive(Default)]
struct SseParser {
    buffer: Vec<u8>,
}

impl SseParser {
    /// Feeds whatever arrived and dispatches every event it completes.
    ///
    /// The callback's error aborts the read, which is how a mid-stream
    /// `event:error` stops the request instead of being ignored.
    fn feed<F>(&mut self, chunk: &[u8], on_event: &mut F) -> Result<(), String>
    where
        F: FnMut(SseEvent) -> Result<(), String>,
    {
        self.buffer.extend_from_slice(chunk);
        while let Some((end, next)) = blank_line(&self.buffer) {
            let event = parse_event(&self.buffer[..end]);
            self.buffer.drain(..next);
            on_event(event)?;
        }
        Ok(())
    }
}

/// Reads a response body as an event stream, one event at a time.
///
/// The cap is the same one `bounded` applies to a whole body: a stream is still
/// a response, and an endpoint that never ends must not be allowed to grow the
/// buffer without limit.
async fn stream_events<F>(response: reqwest::Response, mut on_event: F) -> Result<(), String>
where
    F: FnMut(SseEvent) -> Result<(), String>,
{
    let mut response = response;
    let mut parser = SseParser::default();
    let mut total = 0usize;
    while let Some(chunk) = response
        .chunk()
        .await
        .map_err(|error| format!("read stream: {error}"))?
    {
        total += chunk.len();
        if total > MAX_BYTES {
            return Err("response too large".into());
        }
        parser.feed(&chunk, &mut on_event)?;
    }
    Ok(())
}

/// The message out of an `event:error` payload, if it named one.
fn error_message(data: &str) -> Option<String> {
    let json: Value = serde_json::from_str(data).ok()?;
    let message = json
        .get("msg")
        .or_else(|| json.get("message"))
        .and_then(Value::as_str)
        .map(str::trim)
        .filter(|value| !value.is_empty())?;
    Some(message.to_string())
}

/// What the fast endpoint's stream adds up to.
#[derive(Default)]
struct TextStream {
    text: String,
    /// The direction the server says it actually used, as `from2to`. Worth
    /// keeping: it does not always match what was asked for, and it is the only
    /// confirmation of what the answer is in.
    direction: Option<(String, String)>,
}

/// Folds one event of the fast endpoint's stream into `state`.
fn read_text_event(event: &SseEvent, state: &mut TextStream) -> Result<(), String> {
    if event.name == "error" {
        return Err(error_message(&event.data).unwrap_or_else(|| "translate failed".into()));
    }
    if event.name != "begin" && event.name != "message" {
        return Ok(());
    }
    let Ok(json) = serde_json::from_str::<Value>(&event.data) else {
        // A keep-alive or a comment line is not a payload; nothing to do.
        return Ok(());
    };
    if let Some(kind) = json.get("type").and_then(Value::as_str) {
        if let Some((from, to)) = kind.split_once('2') {
            if !from.is_empty() && !to.is_empty() {
                state.direction = Some((from.to_string(), to.to_string()));
            }
        }
    }
    if let Some(delta) = json.get("transIncre").and_then(Value::as_str) {
        state.text.push_str(delta);
    }
    Ok(())
}

/// The next delta out of one event of the LLM's stream.
///
/// `Ok(None)` covers every event that is not a delta — `begin`, `end`, the
/// opening message whose content is empty, an unrecognised name — because none
/// of them is a failure. An `event:error` is, and comes back as one.
fn read_llm_event(event: &SseEvent) -> Result<Option<String>, String> {
    match event.name.as_str() {
        "message" => {
            let Ok(json) = serde_json::from_str::<Value>(&event.data) else {
                return Ok(None);
            };
            let delta = json
                .get("content")
                .and_then(Value::as_str)
                .filter(|content| !content.is_empty());
            Ok(delta.map(ToOwned::to_owned))
        }
        "error" => Err(error_message(&event.data).unwrap_or_else(|| "llm failed".into())),
        _ => Ok(None),
    }
}

/// The fields `POST /translate/key` is signed over.
///
/// Split out from the request rather than built inline so that the wire format
/// can be asserted. The signature covers every field, so a misspelled name or a
/// changed value is not a cosmetic difference — the endpoint answers `参数错误`
/// or an opaque 500, and neither names the field that was wrong.
fn text_key_fields(millis: u128, yduuid: &str) -> Vec<(String, String)> {
    vec![
        field("product", "webfanyi"),
        field("appVersion", "1"),
        field("client", "webmain"),
        field("mid", "1"),
        field("vendor", "web"),
        field("screen", "1"),
        field("model", "1"),
        field("imei", "1"),
        field("network", "wifi"),
        field("keyfrom", "webfanyi.webmain"),
        field("keyid", TEXT_KEY_ID),
        field("mysticTime", millis.to_string()),
        field("yduuid", yduuid),
        field("abtest", "0"),
        field("targetKeyid", TEXT_STREAM_KEY_ID),
    ]
}

/// The fields the fast endpoint's translation request is signed over.
fn text_stream_fields(
    text: &str,
    from: &str,
    to: &str,
    session: &Session,
    millis: u128,
    yduuid: &str,
) -> Vec<(String, String)> {
    vec![
        field("product", "webfanyi"),
        field("appVersion", "1"),
        field("client", "webmain"),
        field("mid", "1"),
        field("vendor", "web"),
        field("screen", "1"),
        field("model", "1"),
        field("imei", "1"),
        field("network", "wifi"),
        field("keyfrom", "webfanyi.webmain"),
        field("keyid", TEXT_STREAM_KEY_ID),
        field("mysticTime", millis.to_string()),
        field("yduuid", yduuid),
        field("abtest", "0"),
        // The session secret is part of the signed field set, not a header.
        field("signSecretKey", session.secret.clone()),
        field("keyId", TEXT_STREAM_KEY_ID),
        field("token", session.token.clone()),
        field("source", "webmain"),
        field("modelName", "llmLite"),
        field("useTerm", "false"),
        field("i", encode_uri_component(text)),
        field("from", from),
        field("to", to),
    ]
}

/// The fields the LLM's translation request is signed over.
fn llm_chat_fields(
    text: &str,
    from: &str,
    to: &str,
    session: &Session,
    millis: u128,
    yduuid: &str,
) -> Vec<(String, String)> {
    vec![
        field("product", "webfanyi"),
        field("appVersion", "12.0.0"),
        field("client", "webaitrans"),
        field("source", "webaitrans"),
        field("keyfrom", "fanyi.webaitrans"),
        field("keyid", LLM_CHAT_KEY_ID),
        field("mid", "1"),
        field("vendor", "web"),
        field("screen", "1"),
        field("model", "1"),
        field("imei", "1"),
        field("network", "wifi"),
        field("abtest", "0"),
        field("mysticTime", millis.to_string()),
        field("yduuid", yduuid),
        // Optional in practice — the call answers without it — but the site
        // sends it and the quota is attached to the session it names.
        field("token", session.token.clone()),
        field("functionEnglishName", "LLM_translate"),
        field("input", encode_uri_component(text)),
        field("useTerm", "0"),
        // `free=true` is what keeps the anonymous quota from being spent: the
        // same call without it runs out after a handful of translations.
        field("free", "true"),
        field("singleBox", "false"),
        field("fromLang", from),
        field("toLang", to),
        field("roundNo", "1"),
        field("showSuggest", "0"),
    ]
}

/// Asks for a session secret, then the translation.
///
/// `POST /translate/key` carries its parameters in the query string and has no
/// body, which is what the site's own client sends. A GET of the same URL is
/// answered with a 500 whatever the signature says, so the verb is not
/// incidental.
async fn text_session(client: &reqwest::Client) -> Result<Session, String> {
    let mut query = text_key_fields(mystic_time(), &uuid());
    let (signature, point_param) = sign(&query, YOUDAO_TEXT_KEY_SECRET);
    query.push(field("sign", signature));
    query.push(field("pointParam", point_param));
    let response = client
        .post(YOUDAO_TEXT_KEY)
        .header("Referer", REFERER)
        .header("Origin", ORIGIN)
        .body(query_string(&query))
        .send()
        .await
        .map_err(|error| format!("translate key request: {error}"))?;
    if !response.status().is_success() {
        return Err(format!("translate key http {}", response.status().as_u16()));
    }
    let bytes = bounded(response).await?;
    let json: Value = serde_json::from_slice(&bytes)
        .map_err(|error| format!("translate key response: {error}"))?;
    read_session(&json)
}

/// Asks for the LLM's session secret.
///
/// Unlike the fast endpoint this is a GET, and its signature is a fixed
/// `client=…&mysticTime=…&product=…&key=…` string rather than the sorted field
/// list the other endpoints use — sorted, those three names happen to come out
/// in that order, but the order is the contract here, not the sort.
async fn llm_session(client: &reqwest::Client) -> Result<Session, String> {
    let millis = mystic_time();
    let yduuid = uuid();
    let signature = md5_hex(&format!(
        "client=fanyideskweb&mysticTime={millis}&product=webfanyi&key={YOUDAO_LLM_SECRET_KEY}"
    ));
    let url = format!(
        "{YOUDAO_LLM_SECRET}?keyid={LLM_SECRET_KEY_ID}&sign={signature}&client=fanyideskweb&product=webfanyi&appVersion=12.0.0&vendor=web&pointParam=client,mysticTime,product&mysticTime={millis}&keyfrom=fanyi.web&mid=1&screen=1&model=1&network=wifi&abtest=0&yduuid={yduuid}"
    );
    let response = client
        .get(url)
        .header("Referer", REFERER)
        .send()
        .await
        .map_err(|error| format!("llm key request: {error}"))?;
    if !response.status().is_success() {
        return Err(format!("llm key http {}", response.status().as_u16()));
    }
    let bytes = bounded(response).await?;
    let json: Value =
        serde_json::from_slice(&bytes).map_err(|error| format!("llm key response: {error}"))?;
    read_session(&json)
}

#[tauri::command(async)]
pub async fn translate(text: String, from: String, to: String) -> Result<Translation, String> {
    let text = prepare(&text)?;
    let client = client()?;
    let session = text_session(&client).await?;
    let fields = text_stream_fields(&text, &from, &to, &session, mystic_time(), &uuid());
    let response = post_signed(&client, YOUDAO_TEXT_STREAM, fields, &session.secret).await?;
    if !response.status().is_success() {
        return Err(format!("translate http {}", response.status().as_u16()));
    }
    let mut state = TextStream::default();
    stream_events(response, |event| read_text_event(&event, &mut state)).await?;
    let translated = state.text.trim();
    if translated.is_empty() {
        return Err("translate returned nothing".into());
    }
    let (used_from, used_to) = state.direction.unwrap_or((from, to));
    Ok(Translation {
        text: translated.to_string(),
        from: used_from,
        to: used_to,
    })
}

/// A second, LLM-backed translation of a sentence, streamed as it is written.
///
/// Separate from `translate` rather than folded into it: this one is slow, has
/// a quota, and is allowed to fail, and none of that may hold back or take down
/// the fast answer the panel already has. Words never come here — the dictionary
/// card is the better answer for a single word.
///
/// # Events
///
/// Every `content` delta is emitted as [`LLM_DELTA_EVENT`] with an [`LlmDelta`]
/// payload before it is folded into the answer, so the panel can grow the text
/// while the call is still running. `stream` is the caller's own id for the
/// call: a superseded call keeps streaming for seconds after the caller stopped
/// waiting for it, and without an id its deltas would be appended to whatever
/// replaced it. The return value is the whole answer and is authoritative — the
/// deltas are for the seconds before it arrives, not a second source of truth.
#[tauri::command(async)]
pub async fn translate_llm(
    app: tauri::AppHandle,
    stream: String,
    text: String,
    from: String,
    to: String,
) -> Result<String, String> {
    let text = prepare(&text)?;
    let client = client_with_timeout(LLM_TIMEOUT)?;
    let session = llm_session(&client).await?;
    let fields = llm_chat_fields(&text, &from, &to, &session, mystic_time(), &uuid());
    let response = post_signed(&client, YOUDAO_LLM_CHAT, fields, &session.secret).await?;
    if !response.status().is_success() {
        return Err(format!("llm http {}", response.status().as_u16()));
    }
    let mut answer = String::new();
    let id = stream.clone();
    stream_events(response, |event| {
        if let Some(delta) = read_llm_event(&event)? {
            answer.push_str(&delta);
            let _ = app.emit(
                LLM_DELTA_EVENT,
                LlmDelta {
                    stream: id.clone(),
                    delta,
                },
            );
        }
        Ok(())
    })
    .await?;
    let answer = answer.trim();
    if answer.is_empty() {
        return Err("llm returned nothing".into());
    }
    Ok(answer.to_string())
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

    /// Feeds a whole stream through the parser in fixed-size pieces.
    ///
    /// `chunk_size` is the point of the helper: the same bytes have to produce
    /// the same events however the socket happened to cut them up.
    fn feed(input: &str, chunk_size: usize) -> Result<Vec<SseEvent>, String> {
        let mut parser = SseParser::default();
        let mut events = Vec::new();
        for chunk in input.as_bytes().chunks(chunk_size) {
            parser.feed(chunk, &mut |event| {
                events.push(event);
                Ok(())
            })?;
        }
        Ok(events)
    }

    /// The stream the fast endpoint actually sends, as measured against it.
    const TEXT_STREAM: &str = concat!(
        "id:082fcabb-0396-4f8f-b46b-962d30c6f370\n",
        "event:begin\n",
        "data:{\"requestId\":\"082fcabb\",\"type\":\"zh-CHS2en\"}\n",
        "retry:3000\n",
        "\n",
        "id:082fcabb-0396-4f8f-b46b-962d30c6f370\n",
        "event:message\n",
        "data:{\"transIncre\":\"This movie \"}\n",
        "retry:3000\n",
        "\n",
        "event:message\n",
        "data:{\"transIncre\":\"is really \"}\n",
        "\n",
        "event:message\n",
        "data:{\"transIncre\":\"wonderful.\"}\n",
        "\n",
        "event:end\n",
        "data:{\"requestId\":\"082fcabb\"}\n",
        "\n",
    );

    /// The stream the LLM endpoint actually sends, as measured against it.
    const LLM_STREAM: &str = concat!(
        "id:79b3255c\n",
        "event:begin\n",
        "data:{\"roundFunctionName\":\"AI翻译-高级模型\"}\n",
        "retry:3000\n",
        "\n",
        "event:message\n",
        "data:{\"model\":\"yd_agent\",\"content\":\"\"}\n",
        "\n",
        "event:message\n",
        "data:{\"model\":\"yd_agent\",\"content\":\"in one \"}\n",
        "\n",
        "event:message\n",
        "data:{\"model\":\"yd_agent\",\"content\":\"go\"}\n",
        "\n",
        "event:end\n",
        "data:{\"suggest\":[]}\n",
        "\n",
    );

    fn collect_text(input: &str) -> Result<TextStream, String> {
        collect_text_chunked(input, 64)
    }

    fn collect_text_chunked(input: &str, chunk_size: usize) -> Result<TextStream, String> {
        let mut state = TextStream::default();
        for event in feed(input, chunk_size)? {
            read_text_event(&event, &mut state)?;
        }
        Ok(state)
    }

    fn collect_llm(input: &str) -> Result<String, String> {
        let mut answer = String::new();
        for event in feed(input, 64)? {
            if let Some(delta) = read_llm_event(&event)? {
                answer.push_str(&delta);
            }
        }
        Ok(answer)
    }

    #[test]
    fn reads_a_youdao_sentence_translation() {
        let state = collect_text(TEXT_STREAM).expect("translation");
        assert_eq!(state.text, "This movie is really wonderful.");
        assert_eq!(
            state.direction,
            Some(("zh-CHS".to_string(), "en".to_string()))
        );
    }

    /// `event:error` is the one thing in the stream that is a failure, and it
    /// has to abort the read rather than leave a partial translation behind.
    #[test]
    fn reports_a_sentence_stream_error() {
        let input = concat!(
            "event:begin\n",
            "data:{\"type\":\"zh-CHS2en\"}\n",
            "\n",
            "event:message\n",
            "data:{\"transIncre\":\"half a \"}\n",
            "\n",
            "event:error\n",
            "data:{\"msg\":\"无可用次数\",\"code\":601}\n",
            "\n",
        );
        let mut state = TextStream::default();
        let error = feed(input, 8)
            .expect("parse")
            .into_iter()
            .find_map(|event| read_text_event(&event, &mut state).err())
            .expect("error event");
        assert_eq!(error, "无可用次数");
    }

    /// An `event:error` with nothing readable in it still has to stop the call,
    /// rather than being swallowed and reported as an empty translation.
    #[test]
    fn reports_a_sentence_stream_error_without_a_message() {
        let input = "event:error\ndata:\n\n";
        let mut state = TextStream::default();
        let error = feed(input, 4)
            .expect("parse")
            .into_iter()
            .find_map(|event| read_text_event(&event, &mut state).err())
            .expect("error event");
        assert_eq!(error, "translate failed");
    }

    /// A stream that ends without any content is what the endpoint answers for a
    /// language pair it will not translate — a `begin`, an `end`, and nothing in
    /// between. It must not read as a successful empty translation.
    #[test]
    fn reports_a_sentence_stream_that_ends_without_content() {
        let input = concat!(
            "event:begin\n",
            "data:{\"type\":\"zh-CHS2en\"}\n",
            "\n",
            "event:end\n",
            "data:{}\n",
            "\n",
        );
        let state = collect_text(input).expect("parse");
        assert!(state.text.trim().is_empty());
    }

    /// The bug this parser exists to avoid: a delta split across two reads is
    /// dropped, and the translation silently loses a word. Feeding the same
    /// stream one byte at a time proves every boundary is safe, including the
    /// ones inside a multi-byte character.
    #[test]
    fn survives_a_chunk_boundary_inside_an_event() {
        let expected = collect_text(TEXT_STREAM).expect("whole");
        for size in [1, 2, 3, 5, 7, 16, 64, 4096] {
            let state = collect_text_chunked(TEXT_STREAM, size).expect("parse");
            assert_eq!(state.text, expected.text, "chunk size {size}");
            assert_eq!(state.direction, expected.direction, "chunk size {size}");
        }
        // The multi-byte case: `data` carries Chinese, so a one-byte feed puts a
        // boundary inside a character as well as inside the event.
        let chinese = concat!(
            "event:message\n",
            "data:{\"transIncre\":\"一口气\"}\n",
            "\n",
        );
        for size in [1, 2, 3, 4, 5] {
            let mut parser = SseParser::default();
            let mut state = TextStream::default();
            for chunk in chinese.as_bytes().chunks(size) {
                parser
                    .feed(chunk, &mut |event| read_text_event(&event, &mut state))
                    .expect("parse");
            }
            assert_eq!(state.text, "一口气", "chunk size {size}");
        }
    }

    /// `\r\n` is the other line ending a proxy may hand back, and it must not
    /// leave a stray `\r` on the end of every delta.
    #[test]
    fn reads_a_stream_with_crlf_line_endings() {
        let input = "event:message\r\ndata:{\"transIncre\":\"ok\"}\r\n\r\n";
        let state = collect_text(input).expect("parse");
        assert_eq!(state.text, "ok");
    }

    #[test]
    fn reads_an_llm_answer_from_a_stream() {
        assert_eq!(collect_llm(LLM_STREAM).expect("answer"), "in one go");
    }

    #[test]
    fn reports_an_llm_stream_error() {
        let input = concat!(
            "event:message\n",
            "data:{\"content\":\"half \"}\n",
            "\n",
            "event:error\n",
            "data:{\"msg\":\"无可用次数\",\"code\":601}\n",
            "\n",
        );
        let mut answer = String::new();
        let error = feed(input, 4)
            .expect("parse")
            .into_iter()
            .find_map(|event| match read_llm_event(&event) {
                Ok(Some(delta)) => {
                    answer.push_str(&delta);
                    None
                }
                Ok(None) => None,
                Err(error) => Some(error),
            })
            .expect("error event");
        assert_eq!(error, "无可用次数");
    }

    /// The opening message carries an empty `content`, and an answer that never
    /// grows past it is a call that returned nothing — the endpoint's response
    /// to a target language it will not translate.
    #[test]
    fn reports_an_llm_stream_that_ends_without_content() {
        let input = concat!(
            "event:begin\n",
            "data:{\"roundFunctionName\":\"AI翻译-高级模型\"}\n",
            "\n",
            "event:message\n",
            "data:{\"model\":\"yd_llmPro\",\"content\":\"\"}\n",
            "\n",
            "event:end\n",
            "data:{\"suggest\":[]}\n",
            "\n",
        );
        assert_eq!(collect_llm(input).expect("parse"), "");
    }

    /// The signature is the part that breaks silently when Youdao rotates a
    /// secret, so it is pinned to a value rather than to its own helper.
    #[test]
    fn signs_the_way_the_site_does() {
        let fields = vec![
            field("client", "fanyideskweb"),
            field("product", "webfanyi"),
            field("mysticTime", "1700000000000"),
        ];
        let (signature, point_param) = sign(&fields, "secret");
        assert_eq!(signature, "9f3f187482ad186ad1f97146e24b9819");
        assert_eq!(point_param, "client,mysticTime,product,key");
        // An empty field is dropped from both halves, which is how the site's
        // own helper behaves.
        let (_, point_param) = sign(&[field("a", ""), field("b", "1")], "s");
        assert_eq!(point_param, "b,key");
    }

    /// The wire format of all three signed requests, pinned to what the live
    /// endpoints were measured with.
    ///
    /// The hashes were produced by an independent MD5 rather than by `md5_hex`,
    /// so this fails if the sort, the `&key=` append or the digest itself drifts.
    /// The bodies are asserted too, because a field is what actually has to
    /// change when Youdao moves one — and a wrong field is rejected with a
    /// message that names nothing.
    #[test]
    fn builds_the_requests_the_endpoints_expect() {
        let session = Session {
            token: "TOKEN".into(),
            secret: "SECRET".into(),
        };
        let millis = 1_700_000_000_000;

        let key = text_key_fields(millis, "UUID");
        assert_eq!(
            signature_body(&key, YOUDAO_TEXT_KEY_SECRET),
            "abtest=0&appVersion=1&client=webmain&imei=1&keyfrom=webfanyi.webmain&keyid=translate-webmain-key-getter&mid=1&model=1&mysticTime=1700000000000&network=wifi&product=webfanyi&screen=1&targetKeyid=translate-webfanyi-webmain&vendor=web&yduuid=UUID&key=kSy5gtKA4yRUxAVPJPrdYKZ0jBKyd3t1"
        );
        assert_eq!(
            sign(&key, YOUDAO_TEXT_KEY_SECRET).0,
            "bceac866fcbb05420534b5220eeb45ad"
        );

        let text = text_stream_fields("一口气", "zh-CHS", "en", &session, millis, "UUID");
        assert_eq!(
            signature_body(&text, &session.secret),
            "abtest=0&appVersion=1&client=webmain&from=zh-CHS&i=%E4%B8%80%E5%8F%A3%E6%B0%94&imei=1&keyId=translate-webfanyi-webmain&keyfrom=webfanyi.webmain&keyid=translate-webfanyi-webmain&mid=1&model=1&modelName=llmLite&mysticTime=1700000000000&network=wifi&product=webfanyi&screen=1&signSecretKey=SECRET&source=webmain&to=en&token=TOKEN&useTerm=false&vendor=web&yduuid=UUID&key=SECRET"
        );
        assert_eq!(
            sign(&text, &session.secret).0,
            "e0ce01bdcf78795fdf49561088604957"
        );

        let chat = llm_chat_fields("一口气", "zh-CHS", "en", &session, millis, "UUID");
        assert_eq!(
            signature_body(&chat, &session.secret),
            "abtest=0&appVersion=12.0.0&client=webaitrans&free=true&fromLang=zh-CHS&functionEnglishName=LLM_translate&imei=1&input=%E4%B8%80%E5%8F%A3%E6%B0%94&keyfrom=fanyi.webaitrans&keyid=ai-translate-llm&mid=1&model=1&mysticTime=1700000000000&network=wifi&product=webfanyi&roundNo=1&screen=1&showSuggest=0&singleBox=false&source=webaitrans&toLang=en&token=TOKEN&useTerm=0&vendor=web&yduuid=UUID&key=SECRET"
        );
        assert_eq!(
            sign(&chat, &session.secret).0,
            "b9e66332afd1679f771a8c251255369f"
        );
        assert_eq!(
            sign(&chat, &session.secret).1,
            "abtest,appVersion,client,free,fromLang,functionEnglishName,imei,input,keyfrom,keyid,mid,model,mysticTime,network,product,roundNo,screen,showSuggest,singleBox,source,toLang,token,useTerm,vendor,yduuid,key"
        );

        // The secret endpoint signs a fixed string instead of a field list, so
        // it is pinned on its own rather than through `sign`.
        assert_eq!(
            md5_hex(&format!(
                "client=fanyideskweb&mysticTime={millis}&product=webfanyi&key={YOUDAO_LLM_SECRET_KEY}"
            )),
            "d747be1c35bbf34a49e0fb59dd951cc4"
        );
    }

    #[test]
    fn encodes_the_text_the_way_the_site_does() {
        assert_eq!(encode_uri_component("一口气"), "%E4%B8%80%E5%8F%A3%E6%B0%94");
        assert_eq!(encode_uri_component("a b"), "a%20b");
        // JavaScript's unreserved set is wider than the RFC 3986 one.
        assert_eq!(encode_uri_component("a-b_c.d!~*'()"), "a-b_c.d!~*'()");
        assert_eq!(encode_uri_component("100%"), "100%25");
    }

    #[test]
    fn builds_a_multipart_body_the_server_can_read() {
        let fields = vec![field("a", "1"), field("empty", ""), field("b", "2")];
        let body = String::from_utf8(multipart_body(&fields, "BOUND")).expect("utf-8");
        assert_eq!(
            body,
            "--BOUND\r\nContent-Disposition: form-data; name=\"a\"\r\n\r\n1\r\n\
             --BOUND\r\nContent-Disposition: form-data; name=\"b\"\r\n\r\n2\r\n\
             --BOUND--\r\n"
        );
    }

    #[test]
    fn makes_a_uuid_shaped_id() {
        let id = uuid();
        assert_eq!(id.len(), 36);
        assert_eq!(id.matches('-').count(), 4);
        assert_eq!(id.chars().nth(14), Some('4'));
        assert_ne!(id, uuid());
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
