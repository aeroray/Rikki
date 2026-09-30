use std::collections::HashSet;
use std::fs;
use std::hash::{Hash, Hasher};
use std::path::{Path, PathBuf};

use tauri::{AppHandle, Manager};

use crate::apps::InstalledApp;

#[cfg(target_os = "windows")]
const ICON_SIZE: u32 = 32;

pub fn attach_icons(app: &AppHandle, apps: &mut [InstalledApp]) {
    let Some(mut cache) = IconCache::apps(app) else {
        return;
    };
    for entry in apps.iter_mut() {
        if let Some(icon) = cache.icon(&entry.path) {
            entry.icon = icon;
        }
    }
    cache.finish();
}

/// A directory of extracted icons, keyed by the path each one came from.
///
/// Two lists are filled from this — installed apps and browsers — and each
/// cache prunes itself down to exactly what it was just asked for, so they
/// cannot share a directory: whichever list was read last would delete the
/// other's icons. The browser cache is a subdirectory of the app one, which
/// `prune_icons` skips and the asset protocol scope already covers.
pub struct IconCache {
    dir: PathBuf,
    keep: HashSet<PathBuf>,
}

impl IconCache {
    pub fn apps(app: &AppHandle) -> Option<IconCache> {
        IconCache::open(app, "apps/icons")
    }

    pub fn browsers(app: &AppHandle) -> Option<IconCache> {
        IconCache::open(app, "apps/icons/browsers")
    }

    fn open(app: &AppHandle, dir: &str) -> Option<IconCache> {
        let dir = app.path().app_data_dir().ok()?.join(dir);
        fs::create_dir_all(&dir).ok()?;
        Some(IconCache {
            dir,
            keep: HashSet::new(),
        })
    }

    /// The cached icon for `source`, extracted the first time it is asked for.
    ///
    /// An icon is an enhancement, so every failure here is an absent icon —
    /// `None` — rather than an error the caller has to act on.
    pub fn icon(&mut self, source: &str) -> Option<String> {
        let dest = self.dir.join(icon_filename(source));
        if !dest.exists() {
            let _ = extract_icon(source, &dest);
        }
        if !dest.exists() {
            return None;
        }
        self.keep.insert(dest.clone());
        Some(dest.to_string_lossy().into_owned())
    }

    /// Drops the icons nothing asked for, so an uninstalled app or a browser
    /// that has been removed does not leave its icon behind forever.
    pub fn finish(self) {
        prune_icons(&self.dir, &self.keep);
    }
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
        // Only files: the browser cache is a subdirectory, and `remove_file`
        // on a directory would either fail or, worse, look like it worked.
        if path.is_file()
            && path.extension().is_some_and(|ext| ext == "png")
            && !keep.contains(&path)
        {
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
    // Write through a temp file: a half-written PNG would otherwise be treated
    // as a valid cache hit by `attach_icons` on every later run.
    //
    // The format is named rather than left to `save`, which reads it off the
    // extension — and the temp file's extension is `.tmp`, which is why every
    // icon extraction failed with "not recognized as an image format".
    let tmp = dest.with_extension("png.tmp");
    image
        .save_with_format(&tmp, image::ImageFormat::Png)
        .map_err(|err| format!("write icon png: {err}"))?;
    fs::rename(&tmp, dest).map_err(|err| {
        let _ = fs::remove_file(&tmp);
        format!("commit icon png: {err}")
    })
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
        let mut rgba = vec![0u8; (ICON_SIZE * ICON_SIZE * 4) as usize];
        // Every GDI object is released on both paths; returning early with `?`
        // here used to leak the DC, the screen DC and the shell icon handle.
        match CreateDIBSection(hdc, &bmi, DIB_RGB_COLORS, &mut bits, None, 0) {
            Ok(hbmp) => {
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
            }
            Err(err) => eprintln!("rikki: icon bitmap for {app_path}: {err}"),
        }
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
    let bundle = bundle_root(app_path).ok_or_else(|| "no app bundle".to_string())?;
    let icns = find_icns(bundle).ok_or_else(|| "no icns".to_string())?;
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

/// The `.app` bundle a path belongs to.
///
/// Installed apps are listed by their bundle directory, but a browser is listed
/// by the executable inside it, and the icon lives in the bundle either way.
#[cfg(target_os = "macos")]
fn bundle_root(app_path: &Path) -> Option<&Path> {
    app_path
        .ancestors()
        .find(|path| path.extension().is_some_and(|ext| ext == "app"))
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

    #[cfg(target_os = "macos")]
    #[test]
    fn a_browser_executable_resolves_to_its_bundle() {
        use std::path::Path;

        let bundle = Path::new("/Applications/Google Chrome.app");
        assert_eq!(
            super::bundle_root(&bundle.join("Contents/MacOS/Google Chrome")),
            Some(bundle)
        );
        assert_eq!(super::bundle_root(bundle), Some(bundle));
        assert_eq!(super::bundle_root(Path::new("/usr/bin/open")), None);
    }

    /// The write goes through a `.tmp` file, so the format has to be named
    /// rather than read off the extension — reading it off the extension is
    /// what made every icon extraction fail.
    #[cfg(target_os = "windows")]
    #[test]
    fn an_icon_is_written_through_a_temp_file() {
        let dir = std::env::temp_dir().join("rikki icon write test");
        std::fs::create_dir_all(&dir).expect("create temp dir");
        let dest = dir.join("icon.png");
        let rgba = vec![0u8, 128, 255, 255].repeat(16);

        super::write_png(&dest, 4, 4, rgba).expect("write the icon");

        let written = image::open(&dest).expect("read the icon back");
        assert_eq!((written.width(), written.height()), (4, 4));
        assert!(!dest.with_extension("png.tmp").exists());
        std::fs::remove_dir_all(dir).ok();
    }
}
