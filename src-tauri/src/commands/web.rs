use std::collections::HashSet;
use std::path::Path;

use serde::Serialize;
use tauri::AppHandle;

use crate::storage::settings_store;

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Browser {
    /// The executable path. It is the value `settings.json` stores, so it also
    /// serves as the identity the picker keys its rows by — and it is the one
    /// field that is unique by construction, because the list is deduplicated
    /// by it. A registry key name would not be: the same subkey can exist in
    /// both hives with different commands.
    pub id: String,
    pub name: String,
    pub path: String,
}

// A registry walk plus a handful of `is_file` checks. `async` keeps it off the
// main thread, where it would otherwise stall the window and the hotkey.
#[tauri::command(async)]
pub fn list_browsers() -> Result<Vec<Browser>, String> {
    Ok(detect_browsers())
}

/// Opens `url` in the browser the user picked, or the system default.
///
/// The setting is re-read from disk on every call rather than cached, so a
/// `settings.json` edited by hand takes effect on the next link instead of the
/// next launch.
#[tauri::command(async)]
pub fn open_web_url(app: AppHandle, url: String) -> Result<(), String> {
    let url = url.trim();
    if !is_http_url(url) {
        return Err("only http(s) URLs can be opened".into());
    }
    let browser = settings_store::load_settings(&app)
        .map(|settings| settings.browser)
        .unwrap_or_default();
    open_in(&browser, url)
}

fn is_http_url(url: &str) -> bool {
    let lower = url.to_ascii_lowercase();
    lower.starts_with("http://") || lower.starts_with("https://")
}

fn open_in(browser: &str, url: &str) -> Result<(), String> {
    let Some(mut command) = launch_command(browser, url) else {
        return open_system_default(url);
    };
    let child = command
        .spawn()
        .map_err(|err| format!("open with the chosen browser: {err}"))?;
    reap(child);
    Ok(())
}

/// Dropping a `Child` does not reap it. This process stays resident for the
/// whole session, so an unreaped helper — and Chrome's launcher exits as soon
/// as it hands the URL to a running instance — would sit as a zombie until the
/// user quit Rikki.
fn reap(mut child: std::process::Child) {
    std::thread::spawn(move || {
        let _ = child.wait();
    });
}

/// The process that should open `url`, or `None` for the system default.
///
/// The path is user-editable in `settings.json`, so it is checked here: a
/// browser that has been uninstalled, or a path that names a directory, falls
/// back to the system default instead of turning every search into an error the
/// user cannot act on.
///
/// The URL is one argv entry and nothing goes through a shell, so a query
/// containing quotes, `&` or `%VAR%` stays a query.
fn launch_command(browser: &str, url: &str) -> Option<std::process::Command> {
    let browser = browser.trim();
    if browser.is_empty() || !Path::new(browser).is_file() {
        return None;
    }
    let mut command = std::process::Command::new(browser);
    command.arg(url);
    Some(command)
}

#[cfg(target_os = "windows")]
fn open_system_default(url: &str) -> Result<(), String> {
    use windows::core::PCWSTR;
    use windows::Win32::Foundation::HWND;
    use windows::Win32::UI::Shell::ShellExecuteW;
    use windows::Win32::UI::WindowsAndMessaging::SW_SHOWNORMAL;

    // The same call `commands::apps` uses for shortcuts, and for the same
    // reason: `cmd /C start` re-parses its argument and expands `%VAR%` even
    // inside quotes. ShellExecuteW resolves the URL through the registered
    // `http` handler itself, which is what "the system default browser" means.
    let file = to_wide(url);
    let result = unsafe {
        ShellExecuteW(
            HWND::default(),
            PCWSTR::null(),
            PCWSTR(file.as_ptr()),
            PCWSTR::null(),
            PCWSTR::null(),
            SW_SHOWNORMAL,
        )
    };
    // ShellExecuteW reports failure as a value <= 32, not as a null handle.
    if (result.0 as isize) <= 32 {
        return Err(format!(
            "open url: ShellExecuteW failed ({})",
            result.0 as isize
        ));
    }
    Ok(())
}

#[cfg(target_os = "macos")]
fn open_system_default(url: &str) -> Result<(), String> {
    let child = std::process::Command::new("open")
        .arg(url)
        .spawn()
        .map_err(|err| format!("open url: {err}"))?;
    reap(child);
    Ok(())
}

#[cfg(not(any(target_os = "windows", target_os = "macos")))]
fn open_system_default(_url: &str) -> Result<(), String> {
    Err("opening a URL is only supported on Windows and macOS".into())
}

/// Drops duplicates and sorts by display name.
fn finish(mut found: Vec<Browser>) -> Vec<Browser> {
    let mut seen = HashSet::new();
    found.retain(|browser| seen.insert(path_key(&browser.path)));
    found.sort_by(|a, b| a.name.to_lowercase().cmp(&b.name.to_lowercase()));
    found
}

/// Windows paths are case-insensitive, so two registrations of the same
/// executable must compare equal.
#[cfg(target_os = "windows")]
fn path_key(path: &str) -> String {
    path.to_lowercase()
}

#[cfg(not(target_os = "windows"))]
fn path_key(path: &str) -> String {
    path.to_string()
}

// ---------------------------------------------------------------------------
// Windows: the browsers registered under `Clients\StartMenuInternet`
// ---------------------------------------------------------------------------

#[cfg(target_os = "windows")]
fn detect_browsers() -> Vec<Browser> {
    use windows::Win32::System::Registry::{
        HKEY_CURRENT_USER, HKEY_LOCAL_MACHINE, KEY_WOW64_32KEY, KEY_WOW64_64KEY,
    };

    let mut found = Vec::new();
    for root in [HKEY_LOCAL_MACHINE, HKEY_CURRENT_USER] {
        // Some browsers register only in the 32-bit view of the key, and a
        // 64-bit process reads the 64-bit view unless it asks otherwise.
        for view in [KEY_WOW64_64KEY, KEY_WOW64_32KEY] {
            collect_registry_browsers(root, view, &mut found);
        }
    }
    finish(found)
}

#[cfg(target_os = "windows")]
fn collect_registry_browsers(
    root: windows::Win32::System::Registry::HKEY,
    view: windows::Win32::System::Registry::REG_SAM_FLAGS,
    found: &mut Vec<Browser>,
) {
    use windows::core::PWSTR;
    use windows::Win32::Foundation::ERROR_SUCCESS;
    use windows::Win32::System::Registry::RegEnumKeyExW;

    let Some(clients) = open_key(root, r"SOFTWARE\Clients\StartMenuInternet", view) else {
        return;
    };
    let mut index = 0;
    loop {
        // A registry key name is capped well below this.
        let mut name = [0u16; 512];
        let mut length = name.len() as u32;
        let status = unsafe {
            RegEnumKeyExW(
                clients.0,
                index,
                PWSTR(name.as_mut_ptr()),
                &mut length,
                None,
                PWSTR::null(),
                None,
                None,
            )
        };
        if status != ERROR_SUCCESS {
            break;
        }
        index += 1;
        let key_name = String::from_utf16_lossy(&name[..length as usize]);
        if let Some(browser) = read_browser(clients.0, &key_name, view) {
            found.push(browser);
        }
    }
}

#[cfg(target_os = "windows")]
fn read_browser(
    clients: windows::Win32::System::Registry::HKEY,
    key_name: &str,
    view: windows::Win32::System::Registry::REG_SAM_FLAGS,
) -> Option<Browser> {
    use windows::Win32::System::Registry::KEY_READ;

    let key = open_key(clients, key_name, view)?;
    let name = read_registry_string(key.0, None)?;
    let name = name.trim();
    if name.is_empty() {
        return None;
    }

    // The `http` association is what makes an entry a browser rather than
    // merely something that put a key here. Without this test the list on a
    // stock machine also offers Internet Explorer, which Windows 11 silently
    // redirects to Edge, and a cloud-drive app that registered itself for file
    // types only.
    let associations = open_key(key.0, r"Capabilities\URLAssociations", KEY_READ)?;
    let http = read_registry_string(associations.0, Some("http"))?;
    if http.trim().is_empty() {
        return None;
    }

    let command = open_key(key.0, r"shell\open\command", KEY_READ)?;
    let command = read_registry_string(command.0, None)?;
    // `executable_path` only answers with a file that exists, so an entry whose
    // browser has been uninstalled is never offered.
    let path = executable_path(&command)?;
    Some(Browser {
        id: path.clone(),
        name: name.to_string(),
        path,
    })
}

/// The executable named by a `shell\open\command` value, if it exists.
///
/// Commands are either quoted (`"C:\...\chrome.exe" %1`) or bare, and a bare
/// one may contain spaces with no quoting at all (`C:\Program Files\Internet
/// Explorer\iexplore.exe`). Splitting on the first space would cut that path in
/// half, so the longest whitespace-delimited prefix that names an existing file
/// wins — which also discards `%1` and any switches trailing the path without
/// having to know their spelling.
#[cfg(target_os = "windows")]
fn executable_path(command: &str) -> Option<String> {
    let command = command.trim();
    if let Some(rest) = command.strip_prefix('"') {
        let path = rest.split('"').next()?.trim().to_string();
        return Path::new(&path).is_file().then_some(path);
    }
    let mut end = command.len();
    loop {
        let candidate = command[..end].trim_end();
        if Path::new(candidate).is_file() {
            return Some(candidate.to_string());
        }
        end = candidate.rfind(char::is_whitespace)?;
    }
}

/// A registry key that closes itself, so an early return cannot leak a handle.
#[cfg(target_os = "windows")]
struct RegKey(windows::Win32::System::Registry::HKEY);

#[cfg(target_os = "windows")]
impl Drop for RegKey {
    fn drop(&mut self) {
        unsafe {
            let _ = windows::Win32::System::Registry::RegCloseKey(self.0);
        }
    }
}

/// Opens a subkey in one registry view. A handle opened with `KEY_WOW64_32KEY`
/// keeps that view for its own subkeys, which is how the capability and command
/// keys are read from the same 32-bit registration they were found under.
#[cfg(target_os = "windows")]
fn open_key(
    root: windows::Win32::System::Registry::HKEY,
    subkey: &str,
    view: windows::Win32::System::Registry::REG_SAM_FLAGS,
) -> Option<RegKey> {
    use windows::core::PCWSTR;
    use windows::Win32::Foundation::ERROR_SUCCESS;
    use windows::Win32::System::Registry::{RegOpenKeyExW, HKEY, KEY_READ};

    let subkey = to_wide(subkey);
    let mut handle = HKEY(std::ptr::null_mut());
    let status = unsafe {
        RegOpenKeyExW(
            root,
            PCWSTR(subkey.as_ptr()),
            0,
            KEY_READ | view,
            &mut handle,
        )
    };
    (status == ERROR_SUCCESS).then_some(RegKey(handle))
}

#[cfg(target_os = "windows")]
fn read_registry_string(
    key: windows::Win32::System::Registry::HKEY,
    name: Option<&str>,
) -> Option<String> {
    use windows::core::PCWSTR;
    use windows::Win32::Foundation::ERROR_SUCCESS;
    use windows::Win32::System::Registry::{
        RegQueryValueExW, REG_EXPAND_SZ, REG_SZ, REG_VALUE_TYPE,
    };

    let name = name.map(to_wide);
    let name = name
        .as_ref()
        .map_or(PCWSTR::null(), |wide| PCWSTR(wide.as_ptr()));

    // The value can be any length, so the first call only asks for its size.
    let mut kind = REG_VALUE_TYPE::default();
    let mut size = 0u32;
    let status = unsafe {
        RegQueryValueExW(key, name, None, Some(&mut kind), None, Some(&mut size))
    };
    if status != ERROR_SUCCESS || size == 0 {
        return None;
    }
    // `REG_EXPAND_SZ` is read as-is: the value is still a path, and a `%VAR%`
    // left inside it simply fails the `is_file` check that follows rather than
    // being offered wrongly. No browser registers one today.
    if kind != REG_SZ && kind != REG_EXPAND_SZ {
        return None;
    }

    let mut buffer = vec![0u8; size as usize];
    let status = unsafe {
        RegQueryValueExW(
            key,
            name,
            None,
            Some(&mut kind),
            Some(buffer.as_mut_ptr()),
            Some(&mut size),
        )
    };
    if status != ERROR_SUCCESS {
        return None;
    }
    buffer.truncate(size as usize);
    let units: Vec<u16> = buffer
        .chunks_exact(2)
        .map(|pair| u16::from_le_bytes([pair[0], pair[1]]))
        .collect();
    Some(
        String::from_utf16_lossy(&units)
            .trim_end_matches('\0')
            .to_string(),
    )
}

#[cfg(target_os = "windows")]
fn to_wide(value: &str) -> Vec<u16> {
    value.encode_utf16().chain(std::iter::once(0)).collect()
}

// ---------------------------------------------------------------------------
// macOS: the bundles in /Applications that claim the `http` scheme
// ---------------------------------------------------------------------------

#[cfg(target_os = "macos")]
fn detect_browsers() -> Vec<Browser> {
    let mut roots = vec![std::path::PathBuf::from("/Applications")];
    if let Some(home) = std::env::var_os("HOME") {
        roots.push(std::path::PathBuf::from(home).join("Applications"));
    }
    let mut found = Vec::new();
    for root in roots {
        collect_bundle_browsers(&root, &mut found);
    }
    finish(found)
}

#[cfg(target_os = "macos")]
fn collect_bundle_browsers(dir: &Path, found: &mut Vec<Browser>) {
    let Ok(entries) = std::fs::read_dir(dir) else {
        return;
    };
    for entry in entries.flatten() {
        // `file_type()` does not follow links, and /Applications is writable by
        // the user: a link pointing at an ancestor would recurse without end.
        if entry.file_type().is_ok_and(|kind| kind.is_symlink()) {
            continue;
        }
        let path = entry.path();
        if path.extension().is_some_and(|ext| ext == "app") && path.is_dir() {
            if let Some(browser) = read_bundle(&path) {
                found.push(browser);
            }
        }
    }
}

#[cfg(target_os = "macos")]
fn read_bundle(bundle: &Path) -> Option<Browser> {
    let info = plist::Value::from_file(bundle.join("Contents/Info.plist")).ok()?;
    let dict = info.as_dictionary()?;

    // Only a bundle that declares the `http` scheme can be a browser; without
    // this test every application in /Applications would be offered. There is
    // deliberately no list of known browser names to fall back on: it would
    // miss anything unusual and go stale.
    let handles_http = dict
        .get("CFBundleURLTypes")
        .and_then(|value| value.as_array())
        .is_some_and(|types| {
            types.iter().any(|entry| {
                entry
                    .as_dictionary()
                    .and_then(|entry| entry.get("CFBundleURLSchemes"))
                    .and_then(|schemes| schemes.as_array())
                    .is_some_and(|schemes| {
                        schemes.iter().any(|scheme| {
                            scheme
                                .as_string()
                                .is_some_and(|scheme| scheme.eq_ignore_ascii_case("http"))
                        })
                    })
            })
        });
    if !handles_http {
        return None;
    }

    let name = dict
        .get("CFBundleName")
        .and_then(|value| value.as_string())
        .filter(|name| !name.is_empty())?;
    let executable = dict
        .get("CFBundleExecutable")
        .and_then(|value| value.as_string())?;
    // The bundle itself is a directory; the setting has to name the file inside
    // it, both so the launch works and so "is this path still a file" means
    // something.
    let path = bundle.join("Contents/MacOS").join(executable);
    if !path.is_file() {
        return None;
    }
    Some(Browser {
        id: path.to_string_lossy().into_owned(),
        name: name.to_string(),
        path: path.to_string_lossy().into_owned(),
    })
}

#[cfg(not(any(target_os = "windows", target_os = "macos")))]
fn detect_browsers() -> Vec<Browser> {
    Vec::new()
}

#[cfg(test)]
mod tests {
    #[cfg(target_os = "windows")]
    use super::executable_path;
    use super::is_http_url;

    /// Creates a real file whose path contains a space, because the parsing
    /// that matters is the bare-command case: the registry holds unquoted
    /// commands such as `C:\Program Files\Internet Explorer\iexplore.exe`.
    ///
    /// Each caller gets its own directory: the tests run in parallel, and a
    /// shared one would be removed under the other test's feet.
    #[cfg(target_os = "windows")]
    fn spaced_executable(name: &str) -> (std::path::PathBuf, String) {
        let dir = std::env::temp_dir().join(format!("rikki browser path test {name}"));
        std::fs::create_dir_all(&dir).expect("create temp dir");
        let exe = dir.join("my browser.exe");
        std::fs::write(&exe, b"").expect("write temp exe");
        let text = exe.to_string_lossy().into_owned();
        (dir, text)
    }

    #[cfg(target_os = "windows")]
    #[test]
    fn quoted_command_drops_the_placeholder() {
        let (dir, exe) = spaced_executable("quoted");
        assert_eq!(executable_path(&format!("\"{exe}\"")), Some(exe.clone()));
        assert_eq!(executable_path(&format!("\"{exe}\" %1")), Some(exe.clone()));
        assert_eq!(
            executable_path(&format!("\"{exe}\" -osint -url \"%1\"")),
            Some(exe.clone())
        );
        std::fs::remove_dir_all(dir).ok();
    }

    #[cfg(target_os = "windows")]
    #[test]
    fn bare_command_keeps_a_path_that_contains_spaces() {
        let (dir, exe) = spaced_executable("bare");
        assert_eq!(executable_path(&exe), Some(exe.clone()));
        assert_eq!(executable_path(&format!("{exe} %1")), Some(exe.clone()));
        assert_eq!(
            executable_path(&format!("{exe} --single-argument %1")),
            Some(exe.clone())
        );
        std::fs::remove_dir_all(dir).ok();
    }

    #[cfg(target_os = "windows")]
    #[test]
    fn missing_or_empty_commands_are_not_offered() {
        assert_eq!(executable_path(""), None);
        assert_eq!(executable_path("   "), None);
        assert_eq!(executable_path("%1"), None);
        assert_eq!(
            executable_path(r#""C:\nope\gone\browser.exe" %1"#),
            None,
            "a browser that cannot be launched must not be offered"
        );
    }

    #[test]
    fn only_http_urls_reach_a_browser() {
        assert!(is_http_url("https://www.bing.com/search?q=rikki"));
        assert!(is_http_url("HTTP://example.com"));
        assert!(!is_http_url("file:///C:/Windows/System32/calc.exe"));
        assert!(!is_http_url("javascript:alert(1)"));
        assert!(!is_http_url("--disable-web-security"));
    }

    /// The URL has to arrive as one argv entry: a query is user text, and a
    /// command interpreter between here and the browser would read its quotes
    /// and `&` as syntax.
    #[test]
    fn a_chosen_browser_gets_the_url_as_a_single_argument() {
        let exe = std::env::current_exe().expect("current exe");
        let exe = exe.to_string_lossy().into_owned();
        let url = r#"https://example.com/search?q=a&b="c" %TEMP%"#;

        let command = super::launch_command(&format!("  {exe}  "), url).expect("chosen browser");
        assert_eq!(command.get_program(), std::ffi::OsStr::new(&exe));
        let args: Vec<&std::ffi::OsStr> = command.get_args().collect();
        assert_eq!(args, vec![std::ffi::OsStr::new(url)]);
    }

    #[test]
    fn an_unusable_browser_setting_asks_for_the_system_default() {
        assert!(super::launch_command("", "https://example.com").is_none());
        assert!(super::launch_command("   ", "https://example.com").is_none());
        assert!(super::launch_command(r"C:\nope\gone\browser.exe", "https://example.com").is_none());
        let dir = std::env::temp_dir().to_string_lossy().into_owned();
        assert!(super::launch_command(&dir, "https://example.com").is_none());
    }
}
