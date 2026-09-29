//! Make a packaged LiveMark the app that opens `.md` and `.markdown` files.
//!
//! A development build does not change the system default. A packaged build
//! claims it once, then leaves a later choice made by the user alone.

use std::path::{Path, PathBuf};

const MARKER: &str = "markdown-default.claimed";
#[cfg(target_os = "macos")]
const BUNDLE_ID: &str = "com.livemark.app";
#[cfg(target_os = "windows")]
const WINDOWS_PROGID: &str = "LiveMark.Markdown";

pub fn claim_markdown_files_once(app_data_dir: &Path) {
    if !packaged_build_claims_the_default() {
        return;
    }
    let marker = app_data_dir.join(MARKER);
    if marker.is_file() {
        return;
    }
    if claim_markdown_files() {
        let _ = std::fs::create_dir_all(app_data_dir);
        let _ = std::fs::write(marker, "ok\n");
    }
}

fn packaged_build_claims_the_default() -> bool {
    !cfg!(debug_assertions)
}

fn claim_markdown_files() -> bool {
    #[cfg(target_os = "macos")]
    {
        return macos::claim();
    }
    #[cfg(target_os = "windows")]
    {
        return windows::claim();
    }
    #[cfg(not(any(target_os = "macos", target_os = "windows")))]
    {
        false
    }
}

#[cfg(any(target_os = "macos", test))]
pub fn macos_app_bundle(executable: &Path) -> Option<PathBuf> {
    let macos_dir = executable.parent()?;
    if macos_dir.file_name()?.to_str()? != "MacOS" {
        return None;
    }
    let contents = macos_dir.parent()?;
    if contents.file_name()?.to_str()? != "Contents" {
        return None;
    }
    let bundle = contents.parent()?;
    if bundle.extension()?.to_str()? != "app" {
        return None;
    }
    Some(bundle.to_path_buf())
}

#[cfg(any(target_os = "macos", test))]
pub fn is_generic_content_type(uti: &str) -> bool {
    matches!(
        uti,
        "public.plain-text"
            | "public.text"
            | "public.data"
            | "public.content"
            | "public.item"
            | "public.utf8-plain-text"
            | "public.utf16-plain-text"
            | "public.utf16-external-plain-text"
    )
}

#[cfg(any(target_os = "windows", test))]
pub fn windows_open_command(executable: &Path) -> String {
    format!("\"{}\" \"%1\"", executable.display())
}

#[cfg(target_os = "macos")]
mod macos {
    use super::{BUNDLE_ID, is_generic_content_type, macos_app_bundle};
    use std::ffi::{CString, c_char, c_void};

    const UTF8: u32 = 0x0800_0100;
    const ROLES_ALL: u32 = u32::MAX;
    const POSIX_PATH: i32 = 0;

    #[link(name = "CoreFoundation", kind = "framework")]
    unsafe extern "C" {
        fn CFStringCreateWithCString(
            allocator: *const c_void,
            cstr: *const c_char,
            encoding: u32,
        ) -> *const c_void;
        fn CFStringGetCString(
            string: *const c_void,
            buffer: *mut c_char,
            buffer_size: isize,
            encoding: u32,
        ) -> u8;
        fn CFRelease(value: *const c_void);
        fn CFURLCreateWithFileSystemPath(
            allocator: *const c_void,
            path: *const c_void,
            style: i32,
            is_directory: u8,
        ) -> *const c_void;
    }

    #[link(name = "CoreServices", kind = "framework")]
    unsafe extern "C" {
        fn LSRegisterURL(url: *const c_void, update: u8) -> i32;
        fn LSSetDefaultRoleHandlerForContentType(
            content_type: *const c_void,
            role: u32,
            bundle_id: *const c_void,
        ) -> i32;
        fn UTTypeCreatePreferredIdentifierForTag(
            tag_class: *const c_void,
            tag: *const c_void,
            conforming_to: *const c_void,
        ) -> *const c_void;
    }

    pub fn claim() -> bool {
        let Some(bundle) = std::env::current_exe()
            .ok()
            .as_deref()
            .and_then(macos_app_bundle)
        else {
            return false;
        };
        let Ok(bundle_path) = CString::new(bundle.to_string_lossy().as_bytes()) else {
            return false;
        };
        unsafe {
            let path = cf_string(bundle_path.as_ptr());
            if path.is_null() {
                return false;
            }
            let url = CFURLCreateWithFileSystemPath(std::ptr::null(), path, POSIX_PATH, 1);
            CFRelease(path);
            if url.is_null() {
                return false;
            }
            LSRegisterURL(url, 1);
            CFRelease(url);
        }

        let mut claimed = false;
        for uti in ["com.livemark.markdown", "net.daringfireball.markdown"] {
            claimed |= set_handler(uti);
        }
        for extension in ["md", "markdown"] {
            if let Some(uti) = preferred_identifier(extension) {
                if !is_generic_content_type(&uti) {
                    claimed |= set_handler(&uti);
                }
            }
        }
        claimed
    }

    fn set_handler(uti: &str) -> bool {
        let Ok(uti) = CString::new(uti) else {
            return false;
        };
        let Ok(bundle_id) = CString::new(BUNDLE_ID) else {
            return false;
        };
        unsafe {
            let content_type = cf_string(uti.as_ptr());
            let handler = cf_string(bundle_id.as_ptr());
            if content_type.is_null() || handler.is_null() {
                if !content_type.is_null() {
                    CFRelease(content_type);
                }
                if !handler.is_null() {
                    CFRelease(handler);
                }
                return false;
            }
            let status = LSSetDefaultRoleHandlerForContentType(content_type, ROLES_ALL, handler);
            CFRelease(content_type);
            CFRelease(handler);
            status == 0
        }
    }

    fn preferred_identifier(extension: &str) -> Option<String> {
        let Ok(extension) = CString::new(extension) else {
            return None;
        };
        let Ok(tag_class) = CString::new("public.filename-extension") else {
            return None;
        };
        unsafe {
            let class_string = cf_string(tag_class.as_ptr());
            let extension_string = cf_string(extension.as_ptr());
            if class_string.is_null() || extension_string.is_null() {
                if !class_string.is_null() {
                    CFRelease(class_string);
                }
                if !extension_string.is_null() {
                    CFRelease(extension_string);
                }
                return None;
            }
            let identifier = UTTypeCreatePreferredIdentifierForTag(
                class_string,
                extension_string,
                std::ptr::null(),
            );
            CFRelease(class_string);
            CFRelease(extension_string);
            if identifier.is_null() {
                return None;
            }
            let mut buffer = [0u8; 512];
            let ok = CFStringGetCString(
                identifier,
                buffer.as_mut_ptr().cast(),
                buffer.len() as isize,
                UTF8,
            );
            CFRelease(identifier);
            if ok == 0 {
                return None;
            }
            let end = buffer
                .iter()
                .position(|byte| *byte == 0)
                .unwrap_or(buffer.len());
            String::from_utf8(buffer[..end].to_vec()).ok()
        }
    }

    unsafe fn cf_string(c_string: *const c_char) -> *const c_void {
        unsafe { CFStringCreateWithCString(std::ptr::null(), c_string, UTF8) }
    }
}

#[cfg(target_os = "windows")]
mod windows {
    use super::{WINDOWS_PROGID, windows_open_command};
    use std::ffi::c_void;

    // HKEY_CURRENT_USER is a sign-extended 0x80000001, not the zero-extended value.
    const HKEY_CURRENT_USER: isize = 0x8000_0001_u32 as i32 as isize;
    const KEY_WRITE: u32 = 0x20006;
    const REG_SZ: u32 = 1;

    #[link(name = "advapi32")]
    unsafe extern "system" {
        fn RegCreateKeyExW(
            key: isize,
            sub_key: *const u16,
            reserved: u32,
            class: *mut u16,
            options: u32,
            sam: u32,
            security: *const c_void,
            result: *mut isize,
            disposition: *mut u32,
        ) -> i32;
        fn RegSetValueExW(
            key: isize,
            value_name: *const u16,
            reserved: u32,
            value_type: u32,
            data: *const u8,
            data_size: u32,
        ) -> i32;
        fn RegCloseKey(key: isize) -> i32;
        fn RegDeleteTreeW(key: isize, sub_key: *const u16) -> i32;
    }

    #[link(name = "shell32")]
    unsafe extern "system" {
        fn SHChangeNotify(event: u32, flags: u32, item1: *const c_void, item2: *const c_void);
    }

    pub fn claim() -> bool {
        let Ok(executable) = std::env::current_exe() else {
            return false;
        };
        let command = windows_open_command(&executable);
        let icon = format!("{},0", executable.display());
        let wrote = set_sz(
            r"Software\Classes\LiveMark.Markdown",
            None,
            "Markdown Document",
        ) && set_sz(
            r"Software\Classes\LiveMark.Markdown\DefaultIcon",
            None,
            &icon,
        ) && set_sz(r"Software\Classes\LiveMark.Markdown\shell", None, "open")
            && set_sz(
                r"Software\Classes\LiveMark.Markdown\shell\open\command",
                None,
                &command,
            )
            && set_sz(r"Software\Classes\.md", None, WINDOWS_PROGID)
            && set_sz(r"Software\Classes\.markdown", None, WINDOWS_PROGID)
            && set_sz(
                r"Software\Classes\Applications\LiveMark.exe\shell\open\command",
                None,
                &command,
            )
            && set_sz(
                r"Software\Classes\Applications\LiveMark.exe\SupportedTypes",
                Some(".md"),
                "",
            )
            && set_sz(
                r"Software\Classes\Applications\LiveMark.exe\SupportedTypes",
                Some(".markdown"),
                "",
            );
        // Windows keeps the previous default in UserChoice and ignores Classes until that key is gone.
        let cleared = delete_tree(
            r"Software\Microsoft\Windows\CurrentVersion\Explorer\FileExts\.md\UserChoice",
        ) && delete_tree(
            r"Software\Microsoft\Windows\CurrentVersion\Explorer\FileExts\.md\UserChoiceLatest",
        ) && delete_tree(
            r"Software\Microsoft\Windows\CurrentVersion\Explorer\FileExts\.markdown\UserChoice",
        ) && delete_tree(
            r"Software\Microsoft\Windows\CurrentVersion\Explorer\FileExts\.markdown\UserChoiceLatest",
        );
        unsafe {
            SHChangeNotify(0x0800_0000, 0x1000, std::ptr::null(), std::ptr::null());
        }
        wrote && cleared
    }

    fn set_sz(sub_key: &str, name: Option<&str>, value: &str) -> bool {
        let sub_key = wide(sub_key);
        let name = name.map(wide);
        let mut data = wide(value);
        unsafe {
            let mut key = 0isize;
            let created = RegCreateKeyExW(
                HKEY_CURRENT_USER,
                sub_key.as_ptr(),
                0,
                std::ptr::null_mut(),
                0,
                KEY_WRITE,
                std::ptr::null(),
                &mut key,
                std::ptr::null_mut(),
            );
            if created != 0 {
                return false;
            }
            let status = RegSetValueExW(
                key,
                name.as_ref()
                    .map(|value| value.as_ptr())
                    .unwrap_or(std::ptr::null()),
                0,
                REG_SZ,
                data.as_mut_ptr().cast(),
                (data.len() * 2) as u32,
            );
            RegCloseKey(key);
            status == 0
        }
    }

    fn delete_tree(sub_key: &str) -> bool {
        let sub_key = wide(sub_key);
        // 0 means the key was removed. 2 means it was already absent.
        let status = unsafe { RegDeleteTreeW(HKEY_CURRENT_USER, sub_key.as_ptr()) };
        status == 0 || status == 2
    }

    fn wide(value: &str) -> Vec<u16> {
        value.encode_utf16().chain(std::iter::once(0)).collect()
    }
}

#[cfg(test)]
mod tests {
    use super::{is_generic_content_type, macos_app_bundle, windows_open_command};
    use std::path::Path;

    #[test]
    fn a_bundled_executable_resolves_to_its_app() {
        let executable = if cfg!(windows) {
            Path::new(r"C:\Apps\LiveMark.app\Contents\MacOS\livemark.exe")
        } else {
            Path::new("/Applications/LiveMark.app/Contents/MacOS/livemark")
        };
        assert_eq!(
            macos_app_bundle(executable).as_deref(),
            Some(Path::new(if cfg!(windows) {
                r"C:\Apps\LiveMark.app"
            } else {
                "/Applications/LiveMark.app"
            }))
        );
    }

    #[test]
    fn a_development_binary_is_not_an_app_bundle() {
        assert!(macos_app_bundle(Path::new("/work/src-tauri/target/debug/livemark")).is_none());
    }

    #[test]
    fn a_development_build_does_not_claim_markdown_files() {
        if !cfg!(debug_assertions) {
            return;
        }
        let directory =
            std::env::temp_dir().join(format!("livemark-default-app-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&directory);
        super::claim_markdown_files_once(&directory);
        assert!(!directory.join(super::MARKER).exists());
        let _ = std::fs::remove_dir_all(&directory);
    }

    #[test]
    fn plain_text_is_not_claimed_as_markdown() {
        assert!(is_generic_content_type("public.plain-text"));
        assert!(is_generic_content_type("public.text"));
        assert!(!is_generic_content_type("com.livemark.markdown"));
        assert!(!is_generic_content_type("net.daringfireball.markdown"));
    }

    #[test]
    fn the_windows_open_command_quotes_the_executable() {
        let executable = if cfg!(windows) {
            Path::new(r"C:\Users\Kris Name\AppData\Local\LiveMark\LiveMark.exe")
        } else {
            Path::new("/Applications/LiveMark.app/Contents/MacOS/livemark")
        };
        assert_eq!(
            windows_open_command(executable),
            format!("\"{}\" \"%1\"", executable.display())
        );
    }
}
