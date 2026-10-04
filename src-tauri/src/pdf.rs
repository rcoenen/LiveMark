//! Print the focused document to a PDF through the webview's print formatter.
//! `@media print` owns the page. Native margins stay at 0 so they do not stack on `@page`.

use std::fs::File;
use std::io::{Read, Seek, SeekFrom};
use std::path::{Path, PathBuf};
use std::sync::mpsc::{self, Sender};
use std::time::Duration;

use tauri::{WebviewWindow, webview::PlatformWebview};

const EXPORT_TIMEOUT: Duration = Duration::from_secs(120);

pub fn pdf_file_name(path: &Path) -> String {
    let stem = path
        .file_stem()
        .and_then(|stem| stem.to_str())
        .filter(|stem| !stem.is_empty())
        .unwrap_or("Document");
    format!("{stem}.pdf")
}

pub fn with_pdf_extension(path: PathBuf) -> PathBuf {
    let is_pdf = path
        .extension()
        .and_then(|ext| ext.to_str())
        .is_some_and(|ext| ext.eq_ignore_ascii_case("pdf"));
    if is_pdf {
        return path;
    }
    let mut name = path
        .file_name()
        .map(|name| name.to_os_string())
        .unwrap_or_else(|| "Document".into());
    name.push(".pdf");
    path.with_file_name(name)
}

/// Letter is locale paper 1. Every other paper, including an unreadable locale, is A4.
#[cfg(any(windows, test))]
pub fn paper_inches(locale_paper: Option<u32>) -> (f64, f64) {
    if locale_paper == Some(1) {
        (8.5, 11.0)
    } else {
        (210.0 / 25.4, 297.0 / 25.4)
    }
}

pub fn write_pdf(window: &WebviewWindow, path: PathBuf) -> Result<(), String> {
    let (tx, rx) = mpsc::channel();
    // The command runs off the main thread. `with_webview` runs the print there, and this waits for it.
    window
        .with_webview(move |webview| deliver(webview, path, tx))
        .map_err(|_| "LiveMark could not reach the page.".to_owned())?;
    match rx.recv_timeout(EXPORT_TIMEOUT) {
        Ok(result) => result,
        Err(_) => Err("The PDF took too long to write.".to_owned()),
    }
}

fn deliver(webview: PlatformWebview, path: PathBuf, tx: Sender<Result<(), String>>) {
    #[cfg(target_os = "macos")]
    if let Err(error) = start_macos(webview, path, tx.clone()) {
        let _ = tx.send(Err(error));
    }
    #[cfg(windows)]
    if let Err(error) = start_windows(webview, path, tx.clone()) {
        let _ = tx.send(Err(error));
    }
    #[cfg(not(any(target_os = "macos", windows)))]
    {
        let _ = (webview, path);
        let _ = tx.send(Err("PDF export is not available on this system.".to_owned()));
    }
}

#[cfg(any(target_os = "macos", windows))]
fn confirm_pdf(path: &Path) -> Result<(), String> {
    let mut file = File::open(path).map_err(|_| "LiveMark could not write the PDF.".to_owned())?;
    let mut header = [0u8; 5];
    let header_ok = file.read_exact(&mut header).is_ok() && header == *b"%PDF-";
    if !header_ok || !file_ends_with_eof(&mut file) {
        drop(file);
        let _ = std::fs::remove_file(path);
        return Err("LiveMark could not write the PDF.".to_owned());
    }
    Ok(())
}

/// A header is written first. The trailer is the signal that the spool finished.
fn file_ends_with_eof(file: &mut File) -> bool {
    let Ok(len) = file.metadata().map(|data| data.len()) else {
        return false;
    };
    let tail_len = len.min(1024);
    if file.seek(SeekFrom::End(-(tail_len as i64))).is_err() {
        return false;
    }
    let mut tail = vec![0u8; tail_len as usize];
    file.read_exact(&mut tail).is_ok() && tail.windows(5).any(|window| window == b"%%EOF")
}

#[cfg(target_os = "macos")]
fn start_macos(
    webview: PlatformWebview,
    path: PathBuf,
    tx: Sender<Result<(), String>>,
) -> Result<(), String> {
    use objc2::runtime::{AnyObject, ProtocolObject};
    use objc2::sel;
    use objc2_app_kit::{
        NSPaperOrientation, NSPrintInfo, NSPrintJobSavingURL, NSPrintSaveJob,
        NSPrintingPaginationMode, NSWindow,
    };
    use objc2_foundation::{NSCopying, NSPoint, NSRect, NSString, NSURL};

    use objc2_web_kit::WKWebView;

    let path_string = path
        .to_str()
        .ok_or_else(|| "That location cannot be used.".to_owned())?
        .to_owned();
    let ns_window = webview.ns_window();
    if ns_window.is_null() {
        return Err("LiveMark could not reach the page.".to_owned());
    }
    let window = unsafe { &*ns_window.cast::<NSWindow>() };
    let web_view = unsafe { &*webview.inner().cast::<WKWebView>() };

    let print_info = NSPrintInfo::sharedPrintInfo().copy();
    print_info.setJobDisposition(unsafe { NSPrintSaveJob });
    print_info.setOrientation(NSPaperOrientation::Portrait);
    print_info.setTopMargin(0.0);
    print_info.setBottomMargin(0.0);
    print_info.setLeftMargin(0.0);
    print_info.setRightMargin(0.0);
    print_info.setHorizontallyCentered(false);
    print_info.setVerticallyCentered(false);
    print_info.setHorizontalPagination(NSPrintingPaginationMode::Automatic);
    print_info.setVerticalPagination(NSPrintingPaginationMode::Automatic);

    let url = NSURL::fileURLWithPath(&NSString::from_str(&path_string));
    let dictionary = unsafe { print_info.dictionary() };
    let url_object = unsafe { &*(objc2::rc::Retained::as_ptr(&url) as *const AnyObject) };
    unsafe {
        dictionary.setObject_forKey(url_object, ProtocolObject::from_ref(NSPrintJobSavingURL));
    }

    let operation = unsafe { web_view.printOperationWithPrintInfo(&print_info) };
    let Some(print_view) = operation.view() else {
        return Err("LiveMark could not write the PDF.".to_owned());
    };
    // WebKit paginates from this frame. An unset frame makes knowsPageRange: invent blank pages.
    print_view.setFrame(NSRect::new(NSPoint::new(0.0, 0.0), print_info.paperSize()));
    operation.setShowsPrintPanel(false);
    operation.setShowsProgressPanel(false);

    let pending = Box::into_raw(Box::new(PendingPdf {
        tx,
        path,
        _operation: operation.clone(),
    }));
    let delegate = print_delegate();
    let delegate_object = unsafe { &*objc2::rc::Retained::as_ptr(&delegate).cast::<AnyObject>() };
    unsafe {
        operation.runOperationModalForWindow_delegate_didRunSelector_contextInfo(
            window,
            Some(delegate_object),
            Some(sel!(printOperationDidRun:success:contextInfo:)),
            pending.cast(),
        );
    }
    Ok(())
}

#[cfg(target_os = "macos")]
struct PendingPdf {
    tx: Sender<Result<(), String>>,
    path: PathBuf,
    _operation: objc2::rc::Retained<objc2_app_kit::NSPrintOperation>,
}

#[cfg(target_os = "macos")]
fn print_delegate() -> objc2::rc::Retained<PdfPrintDelegate> {
    use std::sync::OnceLock;

    use objc2::{ClassType, msg_send};

    static DELEGATE: OnceLock<objc2::rc::Retained<PdfPrintDelegate>> = OnceLock::new();
    DELEGATE
        .get_or_init(|| unsafe { msg_send![PdfPrintDelegate::class(), new] })
        .clone()
}

#[cfg(target_os = "macos")]
objc2::define_class!(
    #[unsafe(super(objc2::runtime::NSObject))]
    struct PdfPrintDelegate;

    impl PdfPrintDelegate {
        #[unsafe(method(printOperationDidRun:success:contextInfo:))]
        fn did_run(&self, _operation: *mut objc2::runtime::AnyObject, success: bool, context: *mut std::ffi::c_void) {
            if context.is_null() {
                return;
            }
            let pending = unsafe { Box::from_raw(context.cast::<PendingPdf>()) };
            let result = if success {
                confirm_pdf(&pending.path)
            } else {
                let _ = std::fs::remove_file(&pending.path);
                Err("LiveMark could not write the PDF.".to_owned())
            };
            let _ = pending.tx.send(result);
        }
    }
);

#[cfg(windows)]
fn start_windows(
    webview: PlatformWebview,
    path: PathBuf,
    tx: Sender<Result<(), String>>,
) -> Result<(), String> {
    use webview2_com::Microsoft::Web::WebView2::Win32::{
        COREWEBVIEW2_PRINT_ORIENTATION_PORTRAIT, ICoreWebView2_7, ICoreWebView2Environment6,
        ICoreWebView2PrintSettings,
    };
    use webview2_com::PrintToPdfCompletedHandler;
    use windows::core::{HSTRING, Interface};

    let (width, height) = paper_inches(locale_paper());
    let controller = webview.controller();
    let environment = webview.environment();
    let core = unsafe { controller.CoreWebView2() }
        .map_err(|_| "LiveMark could not reach the page.".to_owned())?;
    let printer = core
        .cast::<ICoreWebView2_7>()
        .map_err(|_| "LiveMark could not reach the page.".to_owned())?;
    let environment = environment
        .cast::<ICoreWebView2Environment6>()
        .map_err(|_| "LiveMark could not reach the page.".to_owned())?;
    let settings: ICoreWebView2PrintSettings = unsafe { environment.CreatePrintSettings() }
        .map_err(|_| "LiveMark could not write the PDF.".to_owned())?;
    unsafe {
        settings
            .SetOrientation(COREWEBVIEW2_PRINT_ORIENTATION_PORTRAIT)
            .map_err(|_| "LiveMark could not write the PDF.".to_owned())?;
        settings
            .SetShouldPrintBackgrounds(true)
            .map_err(|_| "LiveMark could not write the PDF.".to_owned())?;
        settings
            .SetShouldPrintHeaderAndFooter(false)
            .map_err(|_| "LiveMark could not write the PDF.".to_owned())?;
        settings
            .SetPageWidth(width)
            .map_err(|_| "LiveMark could not write the PDF.".to_owned())?;
        settings
            .SetPageHeight(height)
            .map_err(|_| "LiveMark could not write the PDF.".to_owned())?;
        settings
            .SetMarginTop(0.0)
            .map_err(|_| "LiveMark could not write the PDF.".to_owned())?;
        settings
            .SetMarginBottom(0.0)
            .map_err(|_| "LiveMark could not write the PDF.".to_owned())?;
        settings
            .SetMarginLeft(0.0)
            .map_err(|_| "LiveMark could not write the PDF.".to_owned())?;
        settings
            .SetMarginRight(0.0)
            .map_err(|_| "LiveMark could not write the PDF.".to_owned())?;
    }

    let wide = HSTRING::from(path.as_path());
    let handler = PrintToPdfCompletedHandler::create(Box::new(
        move |error: windows::core::Result<()>, success: bool| {
            let outcome = if error.is_ok() && success {
                confirm_pdf(&path)
            } else {
                let _ = std::fs::remove_file(&path);
                Err("LiveMark could not write the PDF.".to_owned())
            };
            let _ = tx.send(outcome);
            Ok(())
        },
    ));
    unsafe { printer.PrintToPdf(&wide, &settings, &handler) }
        .map_err(|_| "LiveMark could not write the PDF.".to_owned())?;
    Ok(())
}

#[cfg(windows)]
fn locale_paper() -> Option<u32> {
    use windows::Win32::Globalization::{GetLocaleInfoW, LOCALE_IPAPERSIZE, LOCALE_USER_DEFAULT};

    let mut buffer = [0u16; 8];
    let wrote =
        unsafe { GetLocaleInfoW(LOCALE_USER_DEFAULT, LOCALE_IPAPERSIZE, Some(&mut buffer)) };
    if wrote <= 1 {
        return None;
    }
    String::from_utf16_lossy(&buffer[..wrote as usize - 1])
        .parse()
        .ok()
}

#[cfg(test)]
mod tests {
    use super::{paper_inches, pdf_file_name, with_pdf_extension};
    use std::path::{Path, PathBuf};

    #[test]
    fn suggested_names_use_the_stem() {
        assert_eq!(pdf_file_name(Path::new("notes.md")), "notes.pdf");
        assert_eq!(pdf_file_name(Path::new("notes.markdown")), "notes.pdf");
        assert_eq!(pdf_file_name(Path::new("README")), "README.pdf");
        assert_eq!(pdf_file_name(Path::new("My Notes.md")), "My Notes.pdf");
        assert_eq!(pdf_file_name(Path::new("/tmp/My Notes.md")), "My Notes.pdf");
    }

    #[test]
    fn saved_paths_keep_a_pdf_extension() {
        assert_eq!(
            with_pdf_extension(PathBuf::from("notes")),
            PathBuf::from("notes.pdf")
        );
        assert_eq!(
            with_pdf_extension(PathBuf::from("notes.pdf")),
            PathBuf::from("notes.pdf")
        );
        assert_eq!(
            with_pdf_extension(PathBuf::from("notes.PDF")),
            PathBuf::from("notes.PDF")
        );
    }

    #[test]
    fn letter_is_the_only_non_a4_paper() {
        assert_eq!(paper_inches(Some(1)), (8.5, 11.0));
        assert_eq!(paper_inches(Some(9)), (210.0 / 25.4, 297.0 / 25.4));
        assert_eq!(paper_inches(None), (210.0 / 25.4, 297.0 / 25.4));
    }
}
