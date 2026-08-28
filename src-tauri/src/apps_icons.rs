use std::collections::HashSet;
use std::fs;
use std::hash::{Hash, Hasher};
use std::path::{Path, PathBuf};

use tauri::{AppHandle, Manager};

use crate::apps::InstalledApp;

#[cfg(target_os = "windows")]
const ICON_SIZE: u32 = 32;

pub fn attach_icons(app: &AppHandle, apps: &mut [InstalledApp]) {
    let Ok(dir) = icons_dir(app) else {
        return;
    };
    let _ = fs::create_dir_all(&dir);
    let mut keep = HashSet::new();
    for entry in apps.iter_mut() {
        let dest = dir.join(icon_filename(&entry.path));
        keep.insert(dest.clone());
        if !dest.exists() {
            let _ = extract_icon(&entry.path, &dest);
        }
        if dest.exists() {
            entry.icon = dest.to_string_lossy().into_owned();
        }
    }
    prune_icons(&dir, &keep);
}

fn icons_dir(app: &AppHandle) -> Result<PathBuf, String> {
    let dir = app
        .path()
        .app_data_dir()
        .map_err(|err| format!("resolve app data dir: {err}"))?;
    Ok(dir.join("apps").join("icons"))
}

fn icon_filename(path: &str) -> String {
    let mut hasher = std::collections::hash_map::DefaultHasher::new();
    path.hash(&mut hasher);
    format!("{:016x}.png", hasher.finish())
}

fn prune_icons(dir: &Path, keep: &HashSet<PathBuf>) {
    let Ok(entries) = fs::read_dir(dir) else {
        return;
    };
    for entry in entries.flatten() {
        let path = entry.path();
        if path.extension().is_some_and(|ext| ext == "png") && !keep.contains(&path) {
            let _ = fs::remove_file(path);
        }
    }
}

fn extract_icon(app_path: &str, dest: &Path) -> Result<(), String> {
    #[cfg(target_os = "windows")]
    {
        return windows_icon(app_path, dest);
    }
    #[cfg(target_os = "macos")]
    {
        return macos_icon(Path::new(app_path), dest);
    }
    #[cfg(not(any(target_os = "macos", target_os = "windows")))]
    {
        let _ = (app_path, dest);
        Err("icons are only extracted on Windows and macOS".into())
    }
}

#[cfg(target_os = "windows")]
fn write_png(dest: &Path, width: u32, height: u32, rgba: Vec<u8>) -> Result<(), String> {
    let image = image::RgbaImage::from_raw(width, height, rgba).ok_or("invalid icon pixels")?;
    image
        .save(dest)
        .map_err(|err| format!("write icon png: {err}"))
}

#[cfg(target_os = "windows")]
fn windows_icon(app_path: &str, dest: &Path) -> Result<(), String> {
    use std::mem::size_of;
    use windows::core::HSTRING;
    use windows::Win32::Foundation::HWND;
    use windows::Win32::Graphics::Gdi::{
        CreateCompatibleDC, CreateDIBSection, DeleteDC, DeleteObject, GetDC, ReleaseDC, SelectObject,
        BITMAPINFO, BITMAPINFOHEADER, BI_RGB, DIB_RGB_COLORS, HGDIOBJ,
    };
    use windows::Win32::UI::Shell::{SHGetFileInfoW, SHFILEINFOW, SHGFI_ICON, SHGFI_LARGEICON};
    use windows::Win32::UI::WindowsAndMessaging::{DestroyIcon, DrawIconEx, DI_NORMAL};

    let wide = HSTRING::from(app_path);
    let mut info = SHFILEINFOW::default();
    let result = unsafe {
        SHGetFileInfoW(
            &wide,
            Default::default(),
            Some(&mut info),
            size_of::<SHFILEINFOW>() as u32,
            SHGFI_ICON | SHGFI_LARGEICON,
        )
    };
    if result == 0 || info.hIcon.is_invalid() {
        return Err("no shell icon".into());
    }

    let pixels = unsafe {
        let hdc_screen = GetDC(HWND::default());
        let hdc = CreateCompatibleDC(hdc_screen);
        let mut bits: *mut std::ffi::c_void = std::ptr::null_mut();
        let bmi = BITMAPINFO {
            bmiHeader: BITMAPINFOHEADER {
                biSize: size_of::<BITMAPINFOHEADER>() as u32,
                biWidth: ICON_SIZE as i32,
                biHeight: -(ICON_SIZE as i32),
                biPlanes: 1,
                biBitCount: 32,
                biCompression: BI_RGB.0,
                ..Default::default()
            },
            ..Default::default()
        };
        let hbmp = CreateDIBSection(hdc, &bmi, DIB_RGB_COLORS, &mut bits, None, 0)
            .map_err(|err| err.to_string())?;
        let old = SelectObject(hdc, HGDIOBJ(hbmp.0));
        let drawn = DrawIconEx(
            hdc,
            0,
            0,
            info.hIcon,
            ICON_SIZE as i32,
            ICON_SIZE as i32,
            0,
            None,
            DI_NORMAL,
        );
        let mut rgba = vec![0u8; (ICON_SIZE * ICON_SIZE * 4) as usize];
        if drawn.is_ok() && !bits.is_null() {
            let src = std::slice::from_raw_parts(bits as *const u8, rgba.len());
            for (i, chunk) in src.chunks_exact(4).enumerate() {
                let o = i * 4;
                rgba[o] = chunk[2];
                rgba[o + 1] = chunk[1];
                rgba[o + 2] = chunk[0];
                rgba[o + 3] = chunk[3];
            }
        }
        SelectObject(hdc, old);
        let _ = DeleteObject(HGDIOBJ(hbmp.0));
        let _ = DeleteDC(hdc);
        ReleaseDC(HWND::default(), hdc_screen);
        let _ = DestroyIcon(info.hIcon);
        rgba
    };

    if pixels.iter().all(|byte| *byte == 0) {
        return Err("empty icon".into());
    }
    write_png(dest, ICON_SIZE, ICON_SIZE, pixels)
}

#[cfg(target_os = "macos")]
fn macos_icon(app_path: &Path, dest: &Path) -> Result<(), String> {
    let icns = find_icns(app_path).ok_or_else(|| "no icns".to_string())?;
    if decode_icns(&icns, dest).is_ok() {
        return Ok(());
    }
    let status = std::process::Command::new("sips")
        .args([
            "-s",
            "format",
            "png",
            "-Z",
            "64",
            icns.to_str().ok_or("icns path")?,
            "--out",
            dest.to_str().ok_or("dest path")?,
        ])
        .status()
        .map_err(|err| format!("sips: {err}"))?;
    if status.success() && dest.exists() {
        Ok(())
    } else {
        Err("sips failed".into())
    }
}

#[cfg(target_os = "macos")]
fn find_icns(app_path: &Path) -> Option<PathBuf> {
    let resources = app_path.join("Contents/Resources");
    let info = app_path.join("Contents/Info.plist");
    if let Ok(value) = plist::Value::from_file(&info) {
        if let Some(dict) = value.as_dictionary() {
            if let Some(name) = dict
                .get("CFBundleIconFile")
                .and_then(|value| value.as_string())
            {
                let file = if name.ends_with(".icns") {
                    name.to_string()
                } else {
                    format!("{name}.icns")
                };
                let path = resources.join(file);
                if path.exists() {
                    return Some(path);
                }
            }
        }
    }
    let Ok(entries) = fs::read_dir(&resources) else {
        return None;
    };
    entries.flatten().map(|entry| entry.path()).find(|path| {
        path.extension()
            .is_some_and(|ext| ext.eq_ignore_ascii_case("icns"))
    })
}

#[cfg(target_os = "macos")]
fn decode_icns(icns_path: &Path, dest: &Path) -> Result<(), String> {
    use icns::{IconFamily, IconType};
    let file = fs::File::open(icns_path).map_err(|err| err.to_string())?;
    let family = IconFamily::read(file).map_err(|err| err.to_string())?;
    let preferred = [
        IconType::RGBA32_32x32,
        IconType::RGBA32_64x64,
        IconType::RGBA32_128x128,
        IconType::RGBA32_16x16,
    ];
    for kind in preferred {
        if let Ok(icon) = family.get_icon_with_type(kind) {
            let out = fs::File::create(dest).map_err(|err| err.to_string())?;
            icon.write_png(out).map_err(|err| err.to_string())?;
            return Ok(());
        }
    }
    Err("no usable icns image".into())
}

#[cfg(test)]
mod tests {
    use super::icon_filename;

    #[test]
    fn icon_filename_is_stable_for_same_path() {
        let a = icon_filename(r"C:\Start Menu\Chrome.lnk");
        let b = icon_filename(r"C:\Start Menu\Chrome.lnk");
        assert_eq!(a, b);
        assert!(a.ends_with(".png"));
        assert_ne!(a, icon_filename(r"C:\Start Menu\Edge.lnk"));
    }
}
