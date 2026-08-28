use std::process::Command;

#[tauri::command]
pub fn lock_screen() -> Result<(), String> {
    #[cfg(target_os = "macos")]
    {
        Command::new("/System/Library/CoreServices/Menu Extras/User.menu/Contents/Resources/CGSession")
            .arg("-suspend")
            .spawn()
            .map_err(|err| format!("lock screen: {err}"))?;
        return Ok(());
    }

    #[cfg(target_os = "windows")]
    {
        use std::os::windows::process::CommandExt;
        const CREATE_NO_WINDOW: u32 = 0x0800_0000;
        Command::new("rundll32.exe")
            .arg("user32.dll,LockWorkStation")
            .creation_flags(CREATE_NO_WINDOW)
            .spawn()
            .map_err(|err| format!("lock screen: {err}"))?;
        return Ok(());
    }

    #[cfg(not(any(target_os = "macos", target_os = "windows")))]
    Err("lock screen is only supported on Windows and macOS".into())
}
