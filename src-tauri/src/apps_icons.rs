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

/// Bumped whenever what `extract_icon` produces changes.
///
/// The cache is keyed by nothing but the path an icon came from, so without
/// this an icon written by an older build would go on being served — and the
/// fix that made mask-only icons visible, or that stopped edges being darkened,
/// would only reach an app that had never been listed before.
const ICON_FORMAT_VERSION: u32 = 2;

fn icon_filename(path: &str) -> String {
    let mut hasher = std::collections::hash_map::DefaultHasher::new();
    path.hash(&mut hasher);
    // Older names are not asked for, which is what `prune_icons` clears away.
    format!("v{ICON_FORMAT_VERSION}-{:016x}.png", hasher.finish())
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
    // A shortcut first, because Explorer draws one with the little arrow overlay
    // baked into the icon it hands back, and no flag removes it:
    // `SHGFI_ADDOVERLAYS` asks for more overlays, and leaving it off only means
    // "no extras". The row showed a link badge on every Start Menu entry, which
    // is noise in a launcher — the whole list is shortcuts.
    if app_path.to_ascii_lowercase().ends_with(".lnk") {
        if let Some(pixels) = shortcut_icon(app_path) {
            if pixels.chunks_exact(4).any(|pixel| pixel[3] != 0) {
                return write_png(dest, ICON_SIZE, ICON_SIZE, pixels);
            }
        }
    }

    use std::mem::size_of;
    use windows::core::HSTRING;
    use windows::Win32::UI::Shell::{SHGetFileInfoW, SHFILEINFOW, SHGFI_ICON, SHGFI_LARGEICON};
    use windows::Win32::UI::WindowsAndMessaging::DestroyIcon;

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

    let pixels = visible_rgba(info.hIcon);
    unsafe {
        let _ = DestroyIcon(info.hIcon);
    }

    // An icon with nothing visible in it is worse than no icon: the row would
    // draw an empty tile, and the file would go on being a cache hit.
    let Some(pixels) = pixels.filter(|rgba| rgba.chunks_exact(4).any(|pixel| pixel[3] != 0)) else {
        return Err("icon has nothing visible in it".into());
    };
    write_png(dest, ICON_SIZE, ICON_SIZE, pixels)
}

/// The icon a shortcut *names*, rather than the one the shell draws for it.
///
/// Two steps, and both are needed. `IShellLink::GetIconLocation` gives the path
/// and index the shortcut stores — usually into an executable, a DLL or an `.ico`,
/// and sometimes negative, which means a resource ID rather than an ordinal.
/// `SHDefExtractIcon` is the extractor that accepts a negative index;
/// `ExtractIconEx` does not, which is why `imageres.dll,-27` needs this one.
///
/// `None` when neither source has an icon, so the caller can fall back to the
/// shell's answer — arrow and all, but better than nothing.
#[cfg(target_os = "windows")]
fn shortcut_icon(lnk: &str) -> Option<Vec<u8>> {
    use windows::core::{HSTRING, Interface};
    use windows::Win32::System::Com::{
        CoCreateInstance, CoInitializeEx, CoUninitialize, CLSCTX_INPROC_SERVER,
        COINIT_APARTMENTTHREADED, IPersistFile, STGM_READ,
    };
    use windows::Win32::UI::Shell::{SHDefExtractIconW, ShellLink, IShellLinkW};
    use windows::Win32::UI::WindowsAndMessaging::DestroyIcon;

    /// Plenty for a path; `GetIconLocation` truncates rather than fails.
    const ICON_PATH: usize = 260;

    /// One icon out of one file, as straight RGBA.
    unsafe fn extract(file: &str, index: i32) -> Option<Vec<u8>> {
        let mut large = Default::default();
        // `SHDefExtractIcon` takes the two sizes packed into one `u32`.
        let size = (ICON_SIZE & 0xFFFF) | (ICON_SIZE << 16);
        if SHDefExtractIconW(&HSTRING::from(file), index, 0, Some(&mut large), None, size).is_err() {
            return None;
        }
        let rgba = visible_rgba(large);
        let _ = DestroyIcon(large);
        rgba
    }

    unsafe {
        // The apartment may already be set up, and this runs on whichever thread
        // the icon job landed on. `RPC_E_CHANGED_MODE` means someone else chose
        // the other model, which is fine — COM is usable either way, only the
        // matching `CoUninitialize` is not ours to call.
        let initialised = CoInitializeEx(None, COINIT_APARTMENTTHREADED).is_ok();

        // Both answers in one trip: the icon the shortcut names, and the file it
        // points at. Which one has an icon is not known until they are read.
        let sources = (|| -> Option<(Option<(String, i32)>, Option<String>)> {
            let link: IShellLinkW =
                CoCreateInstance(&ShellLink, None, CLSCTX_INPROC_SERVER).ok()?;
            let file: IPersistFile = link.cast().ok()?;
            file.Load(&HSTRING::from(lnk), STGM_READ).ok()?;

            let icon = {
                let mut buffer = [0u16; ICON_PATH];
                let mut index = 0i32;
                let named = link.GetIconLocation(&mut buffer, &mut index).is_ok();
                let end = buffer.iter().position(|unit| *unit == 0).unwrap_or(0);
                // An empty path is what `,0` means, and it is not "no icon" — it
                // is "the target's". Only a real path is worth expanding.
                if named && end > 0 {
                    expand_environment(&String::from_utf16_lossy(&buffer[..end]))
                        .map(|path| (path, index))
                } else {
                    None
                }
            };

            let target = {
                let mut buffer = [0u16; ICON_PATH];
                let named = link.GetPath(&mut buffer, std::ptr::null_mut(), 0).is_ok();
                let end = buffer.iter().position(|unit| *unit == 0).unwrap_or(0);
                if named && end > 0 {
                    expand_environment(&String::from_utf16_lossy(&buffer[..end]))
                } else {
                    None
                }
            };

            Some((icon, target))
        })();

        let pixels = sources.and_then(|(icon, target)| {
            // The named location first: it is the more specific answer, and it is
            // where a DLL and a resource ID live — how Task Manager names an icon
            // inside `Taskmgr.exe` rather than the executable's own.
            icon.and_then(|(file, index)| extract(&file, index))
                // Then the target, which is the only other clean source. The
                // shell's own answer for a `.lnk` bakes in the arrow overlay.
                .or_else(|| target.and_then(|file| extract(&file, 0)))
        });

        if initialised {
            CoUninitialize();
        }
        pixels
    }
}

/// Expands `%VAR%` references, which shortcut icon paths use freely.
#[cfg(target_os = "windows")]
fn expand_environment(value: &str) -> Option<String> {
    use windows::core::HSTRING;
    use windows::Win32::System::Environment::ExpandEnvironmentStringsW;

    if !value.contains('%') {
        return Some(value.to_string());
    }
    let wide = HSTRING::from(value);
    let needed = unsafe { ExpandEnvironmentStringsW(&wide, None) };
    if needed == 0 {
        return None;
    }
    let mut buffer = vec![0u16; needed as usize];
    let written = unsafe { ExpandEnvironmentStringsW(&wide, Some(&mut buffer)) };
    if written == 0 || written > needed {
        return None;
    }
    let end = buffer.iter().position(|unit| *unit == 0).unwrap_or(buffer.len());
    Some(String::from_utf16_lossy(&buffer[..end]))
}

/// Straight RGBA for an icon, or `None` when it carries no transparency to take
/// its shape from.
///
/// Two things have to be undone here, and both are about the alpha channel.
/// `DrawIconEx` draws onto a bitmap that starts out fully transparent and
/// treats that as a blend, so the icon comes back with its colour already
/// multiplied by its alpha — which a PNG, whose alpha is straight, must not
/// keep. And a Windows icon is as often a 32bpp bitmap whose alpha channel is
/// entirely zero with the real shape in the AND mask; `DrawIconEx` blits the
/// colour for those and never writes the alpha byte, so the whole icon comes
/// out invisible.
#[cfg(target_os = "windows")]
fn visible_rgba(icon: windows::Win32::UI::WindowsAndMessaging::HICON) -> Option<Vec<u8>> {
    let drawn = draw_icon(icon);
    if drawn.chunks_exact(4).any(|pixel| pixel[3] != 0) {
        return Some(un_premultiply(&drawn));
    }
    // The colour is a blit rather than a blend on this path, so it is already
    // straight and only the alpha byte has to be filled in.
    let mask = mask_alpha(icon)?;
    let mut rgba = drawn;
    for (pixel, alpha) in rgba.chunks_exact_mut(4).zip(mask) {
        pixel[3] = alpha;
    }
    Some(rgba)
}

/// Every colour channel un-multiplied by the alpha it was multiplied with.
///
/// Measured on a half-transparent red: `DrawIconEx` answers `(128, 0, 0, 128)`
/// for a source of `(255, 0, 0, 128)`, and drawn as it stands that pixel is
/// darkened by its own alpha a second time.
#[cfg(target_os = "windows")]
fn un_premultiply(rgba: &[u8]) -> Vec<u8> {
    let mut straight = Vec::with_capacity(rgba.len());
    for pixel in rgba.chunks_exact(4) {
        let alpha = u32::from(pixel[3]);
        for channel in &pixel[..3] {
            straight.push(if alpha == 0 || alpha == 255 {
                *channel
            } else {
                ((u32::from(*channel) * 255 + alpha / 2) / alpha).min(255) as u8
            });
        }
        straight.push(pixel[3]);
    }
    straight
}

/// The icon's AND mask as one alpha value per pixel, or `None` when there is no
/// mask to read.
#[cfg(target_os = "windows")]
fn mask_alpha(icon: windows::Win32::UI::WindowsAndMessaging::HICON) -> Option<Vec<u8>> {
    use std::mem::size_of;
    use windows::Win32::Graphics::Gdi::{DeleteObject, GetObjectW, BITMAP, HGDIOBJ};
    use windows::Win32::UI::WindowsAndMessaging::{GetIconInfo, ICONINFO};

    unsafe {
        let mut info = ICONINFO::default();
        GetIconInfo(icon, &mut info).ok()?;
        // A monochrome icon has no colour bitmap and keeps both halves of the
        // image in the mask, which is not the shape this reads.
        let mut bitmap = BITMAP::default();
        let shaped = !info.hbmColor.is_invalid()
            && GetObjectW(
                HGDIOBJ(info.hbmMask.0),
                size_of::<BITMAP>() as i32,
                Some((&mut bitmap as *mut BITMAP).cast()),
            ) == size_of::<BITMAP>() as i32
            && bitmap.bmWidth == ICON_SIZE as i32
            && bitmap.bmHeight == ICON_SIZE as i32;
        let alpha = if shaped { read_mask(info.hbmMask) } else { None };
        // `GetIconInfo` hands over copies, and they are the caller's to free.
        let _ = DeleteObject(HGDIOBJ(info.hbmMask.0));
        let _ = DeleteObject(HGDIOBJ(info.hbmColor.0));
        alpha
    }
}

/// The AND mask read as alpha: a set bit leaves the destination alone, so the
/// icon is drawn — opaque — where the bit is clear.
#[cfg(target_os = "windows")]
fn read_mask(mask: windows::Win32::Graphics::Gdi::HBITMAP) -> Option<Vec<u8>> {
    use std::mem::size_of;
    use windows::Win32::Foundation::HWND;
    use windows::Win32::Graphics::Gdi::{
        CreateCompatibleDC, DeleteDC, GetDC, GetDIBits, ReleaseDC, BITMAPINFO, BITMAPINFOHEADER,
        BI_RGB, DIB_RGB_COLORS,
    };

    unsafe {
        let hdc_screen = GetDC(HWND::default());
        let hdc = CreateCompatibleDC(hdc_screen);
        // `GetDIBits` converts the 1bpp mask into the 32bpp DIB it is asked
        // for: black where the icon is drawn, white where it is not.
        let mut bmi = BITMAPINFO {
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
        let mut read = vec![0u8; (ICON_SIZE * ICON_SIZE * 4) as usize];
        let rows = GetDIBits(
            hdc,
            mask,
            0,
            ICON_SIZE,
            Some(read.as_mut_ptr().cast()),
            &mut bmi,
            DIB_RGB_COLORS,
        );
        let _ = DeleteDC(hdc);
        ReleaseDC(HWND::default(), hdc_screen);
        if rows != ICON_SIZE as i32 {
            return None;
        }
        Some(read.chunks_exact(4).map(|pixel| 255 - pixel[0]).collect())
    }
}

/// An icon drawn into a 32×32 RGBA buffer, as GDI hands it over: premultiplied
/// wherever the icon has an alpha channel of its own.
#[cfg(target_os = "windows")]
fn draw_icon(icon: windows::Win32::UI::WindowsAndMessaging::HICON) -> Vec<u8> {
    use std::mem::size_of;
    use windows::Win32::Foundation::HWND;
    use windows::Win32::Graphics::Gdi::{
        CreateCompatibleDC, CreateDIBSection, DeleteDC, DeleteObject, GetDC, ReleaseDC, SelectObject,
        BITMAPINFO, BITMAPINFOHEADER, BI_RGB, DIB_RGB_COLORS, HGDIOBJ,
    };
    use windows::Win32::UI::WindowsAndMessaging::{DrawIconEx, DI_NORMAL};

    unsafe {
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
                    icon,
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
            Err(err) => eprintln!("rikki: icon bitmap: {err}"),
        }
        let _ = DeleteDC(hdc);
        ReleaseDC(HWND::default(), hdc_screen);
        rgba
    }
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
    use std::collections::HashSet;

    #[test]
    fn icon_filename_is_stable_for_same_path() {
        let a = icon_filename(r"C:\Start Menu\Chrome.lnk");
        let b = icon_filename(r"C:\Start Menu\Chrome.lnk");
        assert_eq!(a, b);
        // The version is what stops an icon an older build wrote from being
        // served as though it were this build's.
        assert!(a.starts_with(&format!("v{}", super::ICON_FORMAT_VERSION)));
        assert!(a.ends_with(".png"));
        assert_ne!(a, icon_filename(r"C:\Start Menu\Edge.lnk"));
    }

    /// The version in the name only replaces what an older build wrote if the
    /// older names are actually dropped.
    #[test]
    fn an_icon_from_an_older_version_is_pruned() {
        let dir = std::env::temp_dir().join("rikki icon prune test");
        std::fs::create_dir_all(&dir).expect("create temp dir");
        let stale = dir.join("0000000000000001.png");
        let current = dir.join(icon_filename(r"C:\Start Menu\Chrome.lnk"));
        std::fs::write(&stale, b"").expect("write the stale icon");
        std::fs::write(&current, b"").expect("write the current icon");

        super::prune_icons(&dir, &HashSet::from([current.clone()]));

        assert!(!stale.exists(), "an icon nothing asked for has to go");
        assert!(current.exists());
        std::fs::remove_dir_all(dir).ok();
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

    /// One RGBA pixel out of a buffer of `ICON_SIZE` square.
    #[cfg(target_os = "windows")]
    fn pixel(rgba: &[u8], x: usize, y: usize) -> [u8; 4] {
        let offset = (y * super::ICON_SIZE as usize + x) * 4;
        rgba[offset..offset + 4].try_into().expect("four channels")
    }

    /// A 32×32 icon with a red disc on a transparent field, built the way an
    /// executable stores one: `alpha` is what the colour bitmap's alpha channel
    /// holds, and the shape is punched into the AND mask.
    ///
    /// An `alpha` of zero is the case that matters, and the one Windows icons
    /// most often have: the colour bitmap claims to be opaque everywhere and
    /// the mask is the only thing that says otherwise.
    #[cfg(target_os = "windows")]
    fn synthetic_icon(alpha: u8) -> windows::Win32::UI::WindowsAndMessaging::HICON {
        use std::mem::size_of;
        use windows::Win32::Foundation::{BOOL, HWND};
        use windows::Win32::Graphics::Gdi::{
            CreateBitmap, CreateCompatibleDC, CreateDIBSection, DeleteDC, DeleteObject, GetDC,
            ReleaseDC, BITMAPINFO, BITMAPINFOHEADER, BI_RGB, DIB_RGB_COLORS, HGDIOBJ,
        };
        use windows::Win32::UI::WindowsAndMessaging::{CreateIconIndirect, ICONINFO};

        const SIZE: i32 = super::ICON_SIZE as i32;
        unsafe {
            let hdc_screen = GetDC(HWND::default());
            let hdc = CreateCompatibleDC(hdc_screen);
            let bmi = BITMAPINFO {
                bmiHeader: BITMAPINFOHEADER {
                    biSize: size_of::<BITMAPINFOHEADER>() as u32,
                    biWidth: SIZE,
                    biHeight: -SIZE,
                    biPlanes: 1,
                    biBitCount: 32,
                    biCompression: BI_RGB.0,
                    ..Default::default()
                },
                ..Default::default()
            };
            let mut bits: *mut core::ffi::c_void = std::ptr::null_mut();
            let color = CreateDIBSection(hdc, &bmi, DIB_RGB_COLORS, &mut bits, None, 0)
                .expect("colour bitmap");
            // Monochrome scan lines are padded to two bytes.
            let stride = (SIZE as usize + 15) / 16 * 2;
            let pixels = std::slice::from_raw_parts_mut(bits as *mut u8, (SIZE * SIZE * 4) as usize);
            // A mask that starts out entirely set — transparent — so that only
            // the disc drawn below is punched through it.
            let mut mask_bits = vec![0xffu8; stride * SIZE as usize];
            let (mid, radius) = (SIZE / 2, SIZE / 3);
            for y in 0..SIZE {
                for x in 0..SIZE {
                    let (dx, dy) = (x - mid, y - mid);
                    if dx * dx + dy * dy < radius * radius {
                        let i = ((y * SIZE + x) * 4) as usize;
                        pixels[i..i + 4].copy_from_slice(&[0, 0, 255, alpha]);
                        mask_bits[y as usize * stride + x as usize / 8] &= !(0x80u8 >> (x % 8));
                    }
                }
            }
            let mask = CreateBitmap(SIZE, SIZE, 1, 1, Some(mask_bits.as_ptr().cast()));
            let icon = CreateIconIndirect(&ICONINFO {
                fIcon: BOOL(1),
                xHotspot: 0,
                yHotspot: 0,
                hbmMask: mask,
                hbmColor: color,
            })
            .expect("synthetic icon");
            let _ = DeleteObject(HGDIOBJ(color.0));
            let _ = DeleteObject(HGDIOBJ(mask.0));
            let _ = DeleteDC(hdc);
            ReleaseDC(HWND::default(), hdc_screen);
            icon
        }
    }

    /// An icon whose colour bitmap has no alpha channel keeps its shape in the
    /// AND mask, and `DrawIconEx` copies the colour but not the mask. Before
    /// the mask was read, every such icon — most of the older ones — was
    /// written with alpha zero on every pixel: invisible, and a cache hit for
    /// good, because the file exists and looks like a successful extraction.
    #[cfg(target_os = "windows")]
    #[test]
    fn an_icon_without_an_alpha_channel_takes_its_shape_from_the_mask() {
        let dir = std::env::temp_dir().join("rikki icon mask test");
        std::fs::create_dir_all(&dir).expect("create temp dir");
        let dest = dir.join("icon.png");

        let icon = synthetic_icon(0);
        let rgba = super::visible_rgba(icon).expect("an icon with a mask has a shape");
        unsafe {
            let _ = windows::Win32::UI::WindowsAndMessaging::DestroyIcon(icon);
        }
        super::write_png(&dest, super::ICON_SIZE, super::ICON_SIZE, rgba).expect("write the icon");

        let written = image::open(&dest).expect("read the icon back").to_rgba8();
        assert_eq!(
            written.get_pixel(0, 0).0,
            [0, 0, 0, 0],
            "the corner is outside the mask, so it must stay transparent"
        );
        assert_eq!(
            written.get_pixel(16, 16).0,
            [255, 0, 0, 255],
            "the disc is inside the mask, so it must stay opaque"
        );
        std::fs::remove_dir_all(dir).ok();
    }

    /// `DrawIconEx` blends the icon onto the transparent bitmap it is given, so
    /// the colour comes back already multiplied by its alpha — measured as
    /// `(128, 0, 0, 128)` for a source of `(255, 0, 0, 128)`. A PNG's alpha is
    /// straight, so keeping that value darkens the pixel by its own alpha a
    /// second time when it is drawn: every anti-aliased edge, on every icon.
    #[cfg(target_os = "windows")]
    #[test]
    fn a_half_transparent_icon_keeps_its_colour() {
        let icon = synthetic_icon(128);
        let rgba = super::visible_rgba(icon).expect("an icon with alpha has a shape");
        unsafe {
            let _ = windows::Win32::UI::WindowsAndMessaging::DestroyIcon(icon);
        }

        assert_eq!(pixel(&rgba, 16, 16), [255, 0, 0, 128]);
        assert_eq!(pixel(&rgba, 0, 0), [0, 0, 0, 0]);
    }

    /// The arithmetic of the above, on a buffer rather than through GDI.
    #[cfg(target_os = "windows")]
    #[test]
    fn a_premultiplied_buffer_is_un_multiplied() {
        let premultiplied = [128, 0, 0, 128, 255, 0, 0, 255, 0, 0, 0, 0];

        assert_eq!(
            super::un_premultiply(&premultiplied),
            [255, 0, 0, 128, 255, 0, 0, 255, 0, 0, 0, 0],
            "only the partial alpha is touched; opaque and transparent pass through"
        );
    }
}
