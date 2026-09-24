mod document;
mod install_source;
mod links;
mod menu;
mod session;

use crate::document::{
    DocumentRegistry, DocumentSnapshot, list_markdown_files, load_snapshot, resolve_document_path,
};
use crate::install_source::install_source;
use crate::session::SessionState;
use crate::links::{LinkTarget, classify_link, resolve_image_path};
use crate::menu::{
    MENU_CLOSE_TAB, MENU_CLOSE_WINDOW, MENU_FORCE_RELOAD, MENU_INSTALL_CLI, MENU_OPEN, MENU_RELOAD,
    MENU_TOGGLE_DEVTOOLS, RENDERER_COMMAND_PREFIX, build_menu,
};
use base64::Engine;
use notify::{Event, RecommendedWatcher, RecursiveMode, Watcher};
use serde::Serialize;
use std::collections::{HashMap, HashSet};
use std::fs;
use std::path::{Path, PathBuf};
use std::process::Command;
use std::sync::Mutex;
use std::thread;
use std::time::{Duration, UNIX_EPOCH};
use tauri::menu::MenuEvent;
use tauri::{AppHandle, Emitter, Manager, RunEvent, State, WebviewUrl, WebviewWindowBuilder, Wry};
use tauri_plugin_dialog::{DialogExt, MessageDialogKind};
use tauri_plugin_opener::OpenerExt;

const MAIN_WINDOW_LABEL: &str = "main";
// Bursts of saves are coalesced into one reload.
const WATCH_STABILITY_DELAY: Duration = Duration::from_millis(180);
// Editors that save by replacing the file leave a short gap in which it does not exist.
const MISSING_RETRY_DELAY: Duration = Duration::from_millis(400);
const CLI_INSTALL_PATH: &str = "/usr/local/bin/livemark";

#[derive(Default)]
struct RuntimeData {
    registry: DocumentRegistry,
    watched_directories: HashMap<PathBuf, usize>,
    refresh_generations: HashMap<String, u64>,
    /// Documents whose file could not be read at the last refresh.
    missing: HashSet<String>,
}

struct RuntimeState {
    data: Mutex<RuntimeData>,
    watcher: Mutex<RecommendedWatcher>,
}

#[derive(Default)]
struct PendingOpenPaths(Mutex<Vec<String>>);

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct BootstrapState {
    documents: Vec<DocumentSnapshot>,
    active_document_id: Option<String>,
    missing_document_ids: Vec<String>,
    version: String,
}

#[derive(Clone, Serialize)]
struct DocumentIdPayload {
    id: String,
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct DocumentRelocatedPayload {
    from_id: String,
    to_id: String,
}

#[derive(Clone, Serialize)]
struct OpenFailedPayload {
    path: String,
    error: String,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct ResolvedImage {
    modified: u64,
    /// Omitted when the caller already holds the image for this modification time.
    data_url: Option<String>,
}

fn lock_error(name: &str) -> String {
    format!("{name} lock is poisoned")
}

fn current_directory() -> PathBuf {
    std::env::current_dir().unwrap_or_else(|_| PathBuf::from("/"))
}

fn show_main_window(app: &AppHandle<Wry>) {
    if let Some(window) = app.get_webview_window(MAIN_WINDOW_LABEL) {
        let _ = window.show();
        let _ = window.unminimize();
        let _ = window.set_focus();
    }
}

fn update_window_title(app: &AppHandle<Wry>, path: Option<&Path>) {
    let Some(window) = app.get_webview_window(MAIN_WINDOW_LABEL) else {
        return;
    };
    let title = path
        .and_then(Path::file_name)
        .map(|name| format!("LiveMark - {}", name.to_string_lossy()))
        .unwrap_or_else(|| "LiveMark".to_owned());
    let _ = window.set_title(&title);
}

fn emit_snapshot(app: &AppHandle<Wry>, snapshot: &DocumentSnapshot) {
    if let Err(error) = app.emit_to(MAIN_WINDOW_LABEL, "document-update", snapshot) {
        eprintln!("could not emit document update: {error}");
    }
}

fn emit_document_id(app: &AppHandle<Wry>, event: &str, document_id: &str) {
    let payload = DocumentIdPayload {
        id: document_id.to_owned(),
    };
    if let Err(error) = app.emit_to(MAIN_WINDOW_LABEL, event, payload) {
        eprintln!("could not emit {event}: {error}");
    }
}

fn emit_activation(app: &AppHandle<Wry>, document_id: &str) {
    let payload = DocumentIdPayload {
        id: document_id.to_owned(),
    };
    if let Err(error) = app.emit_to(MAIN_WINDOW_LABEL, "document-activated", payload) {
        eprintln!("could not emit document activation: {error}");
    }
}

/// Snapshots the registry into the session file so a restart (including an
/// update relaunch) can rebuild the rail.
fn save_session(app: &AppHandle<Wry>) {
    let session = {
        let state = app.state::<RuntimeState>();
        let Ok(data) = state.data.lock() else {
            eprintln!("runtime data lock is poisoned");
            return;
        };
        SessionState {
            documents: data.registry.ids(),
            active_document_id: data.registry.active_id(),
        }
    };
    match app.path().app_data_dir() {
        Ok(directory) => session::persist(&directory, &session),
        Err(error) => eprintln!("could not locate app data directory: {error}"),
    }
}

fn register_document(app: &AppHandle<Wry>, input: &str, cwd: &Path) -> Result<(), String> {
    let path = resolve_document_path(input, cwd)?;
    let snapshot = load_snapshot(&path)?;
    let document_id = snapshot.id.clone();
    let parent = path
        .parent()
        .ok_or_else(|| format!("{} has no parent directory", path.display()))?
        .to_owned();
    let state = app.state::<RuntimeState>();

    {
        let mut data = state.data.lock().map_err(|_| lock_error("runtime data"))?;
        if data.registry.contains(&document_id) {
            data.registry.activate(&document_id);
            drop(data);
            update_window_title(app, Some(&path));
            emit_activation(app, &document_id);
            show_main_window(app);
            save_session(app);
            return Ok(());
        }

        if !data.watched_directories.contains_key(&parent) {
            state
                .watcher
                .lock()
                .map_err(|_| lock_error("filesystem watcher"))?
                .watch(&parent, RecursiveMode::NonRecursive)
                .map_err(|error| format!("could not watch {}: {error}", parent.display()))?;
        }

        *data.watched_directories.entry(parent).or_insert(0) += 1;
        data.registry.insert(path.clone(), snapshot.clone());
    }

    emit_snapshot(app, &snapshot);
    emit_activation(app, &document_id);
    update_window_title(app, Some(&path));
    show_main_window(app);
    save_session(app);
    Ok(())
}

fn register_paths(app: &AppHandle<Wry>, paths: Vec<String>, cwd: &Path) {
    for path in paths {
        if let Err(error) = register_document(app, &path, cwd) {
            eprintln!("could not open document {path}: {error}");
            let payload = OpenFailedPayload { path, error };
            let _ = app.emit_to(MAIN_WINDOW_LABEL, "open-failed", payload);
        }
    }
}

fn register_or_queue_open_paths(app: &AppHandle<Wry>, paths: Vec<String>) {
    if app.try_state::<RuntimeState>().is_some() {
        register_paths(app, paths, &current_directory());
        return;
    }

    let Some(pending) = app.try_state::<PendingOpenPaths>() else {
        eprintln!("could not queue documents before application setup");
        return;
    };
    match pending.0.lock() {
        Ok(mut pending) => pending.extend(paths),
        Err(_) => eprintln!("pending document lock is poisoned"),
    }
}

fn cli_document_paths(args: impl IntoIterator<Item = String>, cwd: &Path) -> Vec<String> {
    args.into_iter()
        .filter(|argument| !argument.is_empty() && !argument.starts_with('-'))
        .map(|argument| {
            let path = Path::new(&argument);
            if path.is_absolute() {
                path.to_owned()
            } else {
                cwd.join(path)
            }
        })
        .map(|path| path.to_string_lossy().into_owned())
        .collect()
}

fn schedule_refreshes(app: &AppHandle<Wry>, event: Event) {
    let state = app.state::<RuntimeState>();
    let scheduled = {
        let mut data = match state.data.lock() {
            Ok(data) => data,
            Err(_) => {
                eprintln!("runtime data lock is poisoned");
                return;
            }
        };
        let document_ids = data.registry.ids_for_event_paths(&event.paths);
        document_ids
            .into_iter()
            .map(|document_id| {
                let generation = data
                    .refresh_generations
                    .entry(document_id.clone())
                    .and_modify(|value| *value += 1)
                    .or_insert(1);
                (document_id, *generation)
            })
            .collect::<Vec<_>>()
    };

    for (document_id, generation) in scheduled {
        let app = app.clone();
        thread::spawn(move || {
            thread::sleep(WATCH_STABILITY_DELAY);
            refresh_document(&app, &document_id, generation);
        });
    }
}

fn refresh_document(app: &AppHandle<Wry>, document_id: &str, generation: u64) {
    let state = app.state::<RuntimeState>();
    let path = {
        let data = match state.data.lock() {
            Ok(data) => data,
            Err(_) => {
                eprintln!("runtime data lock is poisoned");
                return;
            }
        };
        if data.refresh_generations.get(document_id).copied() != Some(generation) {
            return;
        }
        let Some(path) = data.registry.path(document_id) else {
            return;
        };
        path
    };

    let snapshot = match load_snapshot(&path).or_else(|_| {
        thread::sleep(MISSING_RETRY_DELAY);
        load_snapshot(&path)
    }) {
        Ok(snapshot) => snapshot,
        Err(error) => {
            eprintln!("could not refresh {}: {error}", path.display());
            let newly_missing = state
                .data
                .lock()
                .map(|mut data| {
                    data.refresh_generations.get(document_id).copied() == Some(generation)
                        && data.missing.insert(document_id.to_owned())
                })
                .unwrap_or(false);
            if newly_missing {
                emit_document_id(app, "document-missing", document_id);
            }
            return;
        }
    };

    let (changed, restored) = {
        let mut data = match state.data.lock() {
            Ok(data) => data,
            Err(_) => {
                eprintln!("runtime data lock is poisoned");
                return;
            }
        };
        if data.refresh_generations.get(document_id).copied() != Some(generation) {
            return;
        }
        let restored = data.missing.remove(document_id);
        (data.registry.update(snapshot.clone()), restored)
    };

    if restored {
        emit_document_id(app, "document-restored", document_id);
    }
    if changed {
        emit_snapshot(app, &snapshot);
    }
}

fn activate_document_by_id(app: &AppHandle<Wry>, document_id: &str) -> Result<(), String> {
    let state = app.state::<RuntimeState>();
    let path = {
        let mut data = state.data.lock().map_err(|_| lock_error("runtime data"))?;
        if !data.registry.activate(document_id) {
            return Err(format!("unknown document id: {document_id}"));
        }
        data.registry.path(document_id)
    };

    update_window_title(app, path.as_deref());
    emit_activation(app, document_id);
    save_session(app);
    Ok(())
}

fn close_document_by_id(app: &AppHandle<Wry>, document_id: &str) -> Result<(), String> {
    let state = app.state::<RuntimeState>();
    let (outcome, directory_to_unwatch, active_path) = {
        let mut data = state.data.lock().map_err(|_| lock_error("runtime data"))?;
        let outcome = data
            .registry
            .close(document_id)
            .ok_or_else(|| format!("unknown document id: {document_id}"))?;
        data.refresh_generations.remove(document_id);
        data.missing.remove(document_id);

        let parent = outcome.closed_path.parent().map(Path::to_owned);
        let directory_to_unwatch = parent.and_then(|parent| {
            let count = data.watched_directories.get_mut(&parent)?;
            *count -= 1;
            if *count == 0 {
                data.watched_directories.remove(&parent);
                Some(parent)
            } else {
                None
            }
        });
        let active_path = outcome
            .active_id
            .as_deref()
            .and_then(|id| data.registry.path(id));
        (outcome, directory_to_unwatch, active_path)
    };

    if let Some(directory) = directory_to_unwatch {
        if let Err(error) = state
            .watcher
            .lock()
            .map_err(|_| lock_error("filesystem watcher"))?
            .unwatch(&directory)
        {
            eprintln!("could not stop watching {}: {error}", directory.display());
        }
    }

    let payload = DocumentIdPayload {
        id: outcome.closed_id,
    };
    if let Err(error) = app.emit_to(MAIN_WINDOW_LABEL, "document-closed", payload) {
        eprintln!("could not emit document close: {error}");
    }
    if let Some(active_id) = outcome.active_id {
        emit_activation(app, &active_id);
    }
    update_window_title(app, active_path.as_deref());
    save_session(app);
    Ok(())
}

fn close_all_documents(app: &AppHandle<Wry>) {
    let ids = {
        let state = app.state::<RuntimeState>();
        match state.data.lock() {
            Ok(data) => data.registry.ids(),
            Err(_) => {
                eprintln!("runtime data lock is poisoned");
                return;
            }
        }
    };

    for document_id in ids {
        if let Err(error) = close_document_by_id(app, &document_id) {
            eprintln!("could not close document {document_id}: {error}");
        }
    }
}

fn show_open_dialog(app: &AppHandle<Wry>) {
    let app_handle = app.clone();
    app.dialog()
        .file()
        .set_title("Open Markdown Documents")
        .add_filter("Markdown", &["md", "markdown", "txt"])
        .add_filter("All Files", &["*"])
        .pick_files(move |selection| {
            let paths = selection
                .unwrap_or_default()
                .into_iter()
                .filter_map(|file| file.into_path().ok())
                .map(|path| path.to_string_lossy().into_owned())
                .collect::<Vec<_>>();
            register_paths(&app_handle, paths, &current_directory());
        });
}

#[tauri::command]
fn bootstrap(
    app: AppHandle<Wry>,
    state: State<'_, RuntimeState>,
) -> Result<BootstrapState, String> {
    let data = state.data.lock().map_err(|_| lock_error("runtime data"))?;
    Ok(BootstrapState {
        documents: data.registry.snapshots(),
        active_document_id: data.registry.active_id(),
        missing_document_ids: data.missing.iter().cloned().collect(),
        version: app.package_info().version.to_string(),
    })
}

#[tauri::command]
fn open_file_dialog(app: AppHandle<Wry>) {
    show_open_dialog(&app);
}

#[tauri::command]
fn open_file_paths(app: AppHandle<Wry>, file_paths: Vec<String>) {
    register_paths(&app, file_paths, &current_directory());
}

#[tauri::command]
fn activate_document(app: AppHandle<Wry>, document_id: String) -> Result<(), String> {
    activate_document_by_id(&app, &document_id)
}

#[tauri::command]
fn close_document(app: AppHandle<Wry>, document_id: String) -> Result<(), String> {
    close_document_by_id(&app, &document_id)
}

fn read_local_image(
    app: &AppHandle<Wry>,
    document_id: &str,
    source: &str,
    known_modified: Option<u64>,
) -> Result<ResolvedImage, String> {
    let document_path = {
        let state = app.state::<RuntimeState>();
        let data = state.data.lock().map_err(|_| lock_error("runtime data"))?;
        data.registry
            .path(document_id)
            .ok_or_else(|| "document is not open".to_owned())?
    };

    let canonical = resolve_image_path(&document_path, source)?;
    let mime = mime_guess::from_path(&canonical).first_or_octet_stream();
    if mime.type_() != mime_guess::mime::IMAGE {
        return Err("asset is not an image".to_owned());
    }

    let modified = fs::metadata(&canonical)
        .and_then(|metadata| metadata.modified())
        .ok()
        .and_then(|modified| modified.duration_since(UNIX_EPOCH).ok())
        .map(|duration| duration.as_millis() as u64)
        .unwrap_or_default();
    if known_modified == Some(modified) {
        return Ok(ResolvedImage {
            modified,
            data_url: None,
        });
    }

    let bytes = fs::read(&canonical).map_err(|_| "asset could not be read".to_owned())?;
    let encoded = base64::engine::general_purpose::STANDARD.encode(bytes);
    Ok(ResolvedImage {
        modified,
        data_url: Some(format!("data:{};base64,{encoded}", mime.essence_str())),
    })
}

#[tauri::command]
fn resolve_local_image(
    app: AppHandle<Wry>,
    document_id: String,
    source: String,
    known_modified: Option<u64>,
) -> Result<ResolvedImage, String> {
    read_local_image(&app, &document_id, &source, known_modified)
}

/// Points an open document at a new path chosen by the user, keeping its place in the rail.
fn relocate_document_to(app: &AppHandle<Wry>, document_id: &str, new_path: &Path) -> Result<(), String> {
    let new_id = resolve_document_path(&new_path.to_string_lossy(), &current_directory())?
        .to_string_lossy()
        .into_owned();
    if new_id == document_id {
        return Ok(());
    }
    {
        let state = app.state::<RuntimeState>();
        let data = state.data.lock().map_err(|_| lock_error("runtime data"))?;
        if !data.registry.contains(document_id) {
            return Err(format!("unknown document id: {document_id}"));
        }
        if data.registry.contains(&new_id) {
            return Err("that file is already open".to_owned());
        }
    }

    register_document(app, &new_id, &current_directory())?;
    {
        let state = app.state::<RuntimeState>();
        let mut data = state.data.lock().map_err(|_| lock_error("runtime data"))?;
        data.registry.move_before(&new_id, document_id);
    }
    let payload = DocumentRelocatedPayload {
        from_id: document_id.to_owned(),
        to_id: new_id.clone(),
    };
    if let Err(error) = app.emit_to(MAIN_WINDOW_LABEL, "document-relocated", payload) {
        eprintln!("could not emit document relocation: {error}");
    }
    close_document_by_id(app, document_id)?;
    activate_document_by_id(app, &new_id)
}

#[tauri::command]
fn list_sibling_documents(state: State<'_, RuntimeState>) -> Result<Vec<String>, String> {
    let directories = {
        let data = state.data.lock().map_err(|_| lock_error("runtime data"))?;
        data.watched_directories.keys().cloned().collect::<Vec<_>>()
    };
    Ok(list_markdown_files(&directories))
}

#[tauri::command]
fn locate_document(app: AppHandle<Wry>, document_id: String) {
    let app_handle = app.clone();
    app.dialog()
        .file()
        .set_title("Locate Document")
        .add_filter("Markdown", &["md", "markdown", "txt"])
        .pick_file(move |selection| {
            let Some(path) = selection.and_then(|file| file.into_path().ok()) else {
                return;
            };
            if let Err(error) = relocate_document_to(&app_handle, &document_id, &path) {
                let payload = OpenFailedPayload {
                    path: path.to_string_lossy().into_owned(),
                    error,
                };
                let _ = app_handle.emit_to(MAIN_WINDOW_LABEL, "open-failed", payload);
            }
        });
}

#[tauri::command]
fn open_containing_folder(app: AppHandle<Wry>, document_id: String) -> Result<(), String> {
    let path = {
        let state = app.state::<RuntimeState>();
        let data = state.data.lock().map_err(|_| lock_error("runtime data"))?;
        data.registry
            .path(&document_id)
            .ok_or_else(|| "document is not open".to_owned())?
    };
    let folder = path
        .parent()
        .filter(|folder| !folder.as_os_str().is_empty())
        .ok_or_else(|| "document has no folder".to_owned())?;
    app.opener()
        .open_path(folder.to_string_lossy().as_ref(), None::<&str>)
        .map_err(|error| format!("could not open folder: {error}"))
}

#[tauri::command]
fn open_link(app: AppHandle<Wry>, document_id: String, href: String) -> Result<(), String> {
    match classify_link(&href) {
        LinkTarget::External(url) => app
            .opener()
            .open_url(url, None::<&str>)
            .map_err(|error| format!("could not open link: {error}")),
        LinkTarget::Local(path) => {
            let document_directory = {
                let state = app.state::<RuntimeState>();
                let data = state.data.lock().map_err(|_| lock_error("runtime data"))?;
                data.registry
                    .path(&document_id)
                    .and_then(|path| path.parent().map(Path::to_owned))
                    .ok_or_else(|| "document is not open".to_owned())?
            };
            register_document(&app, &path.to_string_lossy(), &document_directory)
        }
        LinkTarget::Ignored => Err("unsupported link".to_owned()),
    }
}

/// The webview only ever shows the bundled app; rendered documents must not be able to replace it.
/// `dev_origin` is the local server `tauri dev` serves the frontend from.
fn is_app_navigation(url: &tauri::Url, dev_origin: Option<&tauri::Url>) -> bool {
    url.scheme() == "tauri"
        || url.host_str() == Some("tauri.localhost")
        || url.as_str() == "about:blank"
        || dev_origin.is_some_and(|dev| dev.origin() == url.origin())
}

fn create_main_window(app: &tauri::App<Wry>) -> tauri::Result<()> {
    let dev_origin = app.config().build.dev_url.clone();
    let builder = WebviewWindowBuilder::new(app, MAIN_WINDOW_LABEL, WebviewUrl::App("index.html".into()))
        .title("LiveMark")
        .inner_size(1240.0, 760.0)
        .min_inner_size(560.0, 300.0)
        .on_navigation(move |url| is_app_navigation(url, dev_origin.as_ref()));
    #[cfg(target_os = "macos")]
    let builder = builder
        .title_bar_style(tauri::TitleBarStyle::Overlay)
        .hidden_title(true);
    builder.build()?;
    Ok(())
}

fn cli_source_path(app: &AppHandle<Wry>) -> Result<PathBuf, String> {
    if cfg!(debug_assertions) {
        return Ok(Path::new(env!("CARGO_MANIFEST_DIR"))
            .parent()
            .expect("src-tauri should have a project parent")
            .join("resources/bin/livemark"));
    }

    app.path()
        .resource_dir()
        .map(|directory| directory.join("bin/livemark"))
        .map_err(|error| format!("could not locate application resources: {error}"))
}

fn apple_script_escape(value: &str) -> String {
    value.replace('\\', "\\\\").replace('"', "\\\"")
}

fn shell_quote(value: &str) -> String {
    format!("'{}'", value.replace('\'', "'\\''"))
}

fn install_cli(app: &AppHandle<Wry>) {
    let source = match cli_source_path(app) {
        Ok(source) => source,
        Err(error) => {
            app.dialog()
                .message(error)
                .kind(MessageDialogKind::Error)
                .title("CLI installation failed")
                .show(|_| {});
            return;
        }
    };
    let destination = Path::new(CLI_INSTALL_PATH);

    if let Ok(metadata) = fs::symlink_metadata(destination) {
        if !metadata.file_type().is_symlink() {
            app.dialog()
                .message(format!(
                    "{CLI_INSTALL_PATH} already exists and is not a symlink. LiveMark left it unchanged."
                ))
                .kind(MessageDialogKind::Error)
                .title("CLI installation failed")
                .show(|_| {});
            return;
        }
        if fs::read_link(destination).ok().as_deref() == Some(source.as_path()) {
            app.dialog()
                .message("The livemark command is already installed.")
                .title("CLI installed")
                .show(|_| {});
            return;
        }
    }

    let direct_status = Command::new("/bin/ln")
        .args(["-sfn"])
        .arg(&source)
        .arg(destination)
        .status();
    let installed = direct_status.is_ok_and(|status| status.success()) || {
        let shell_command = format!(
            "/bin/ln -sfn {} {}",
            shell_quote(&source.to_string_lossy()),
            shell_quote(CLI_INSTALL_PATH)
        );
        let script = format!(
            "do shell script \"{}\" with administrator privileges",
            apple_script_escape(&shell_command)
        );
        Command::new("/usr/bin/osascript")
            .args(["-e", &script])
            .status()
            .is_ok_and(|status| status.success())
    };

    if installed {
        app.dialog()
            .message("You can now use \"livemark <file> [file...]\" from the terminal.")
            .title("CLI installed")
            .show(|_| {});
    } else {
        app.dialog()
            .message(format!(
                "Could not create {CLI_INSTALL_PATH}. You can manually link:\n\nln -s \"{}\" {CLI_INSTALL_PATH}",
                source.display()
            ))
            .kind(MessageDialogKind::Error)
            .title("CLI installation failed")
            .show(|_| {});
    }
}

fn handle_menu_event(app: &AppHandle<Wry>, event: MenuEvent) {
    match event.id().as_ref() {
        MENU_OPEN => show_open_dialog(app),
        MENU_CLOSE_TAB => {
            let active_id = app
                .state::<RuntimeState>()
                .data
                .lock()
                .ok()
                .and_then(|data| data.registry.active_id());
            if let Some(document_id) = active_id {
                let _ = close_document_by_id(app, &document_id);
            } else if let Some(window) = app.get_webview_window(MAIN_WINDOW_LABEL) {
                let _ = window.close();
            }
        }
        MENU_CLOSE_WINDOW => {
            if let Some(window) = app.get_webview_window(MAIN_WINDOW_LABEL) {
                let _ = window.close();
            }
        }
        MENU_INSTALL_CLI => install_cli(app),
        MENU_RELOAD | MENU_FORCE_RELOAD => {
            if let Some(window) = app.get_webview_window(MAIN_WINDOW_LABEL) {
                let _ = window.reload();
            }
        }
        MENU_TOGGLE_DEVTOOLS => {
            if let Some(window) = app.get_webview_window(MAIN_WINDOW_LABEL) {
                if window.is_devtools_open() {
                    window.close_devtools();
                } else {
                    window.open_devtools();
                }
            }
        }
        id => {
            if let Some(command) = id.strip_prefix(RENDERER_COMMAND_PREFIX) {
                let _ = app.emit_to(MAIN_WINDOW_LABEL, "menu-command", command);
            }
        }
    }
}

pub fn run() {
    let builder = tauri::Builder::default()
        .manage(PendingOpenPaths::default())
        .plugin(tauri_plugin_single_instance::init(|app, args, cwd| {
            let paths = cli_document_paths(args.into_iter().skip(1), Path::new(&cwd));
            register_paths(app, paths, Path::new(&cwd));
            show_main_window(app);
        }))
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_process::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .invoke_handler(tauri::generate_handler![
            bootstrap,
            install_source,
            open_file_dialog,
            open_file_paths,
            activate_document,
            close_document,
            resolve_local_image,
            open_link,
            locate_document,
            open_containing_folder,
            list_sibling_documents
        ])
        .on_menu_event(handle_menu_event)
        .on_window_event(|window, event| {
            if window.label() != MAIN_WINDOW_LABEL {
                return;
            }
            if let tauri::WindowEvent::CloseRequested { api, .. } = event {
                api.prevent_close();
                close_all_documents(window.app_handle());
                let _ = window.hide();
            }
        })
        .setup(|app| {
            let watcher_app = app.handle().clone();
            let watcher = notify::recommended_watcher(move |result| match result {
                Ok(event) => schedule_refreshes(&watcher_app, event),
                Err(error) => eprintln!("filesystem watcher error: {error}"),
            })?;
            app.manage(RuntimeState {
                data: Mutex::new(RuntimeData::default()),
                watcher: Mutex::new(watcher),
            });
            app.set_menu(build_menu(app)?)?;
            create_main_window(app)?;

            let pending_paths = app
                .state::<PendingOpenPaths>()
                .0
                .lock()
                .map_err(|_| lock_error("pending documents"))?
                .drain(..)
                .collect::<Vec<_>>();
            register_paths(app.handle(), pending_paths, &current_directory());

            let startup_paths = cli_document_paths(std::env::args().skip(1), &current_directory());
            register_paths(app.handle(), startup_paths, &current_directory());

            // Reopen last session's rail; missing files are skipped quietly.
            if let Ok(directory) = app.path().app_data_dir() {
                let restored = session::read_session(&session::session_file(directory));
                for document_id in restored.documents {
                    if let Err(error) = register_document(app.handle(), &document_id, &current_directory()) {
                        eprintln!("could not restore document {document_id}: {error}");
                    }
                }
                if let Some(active_id) = restored.active_document_id {
                    let _ = activate_document_by_id(app.handle(), &active_id);
                }
            }
            Ok(())
        });

    let application = builder
        .build(tauri::generate_context!())
        .expect("error while building LiveMark");

    application.run(|app, event| match event {
        #[cfg(target_os = "macos")]
        RunEvent::Opened { urls } => {
            let paths = urls
                .into_iter()
                .filter_map(|url| url.to_file_path().ok())
                .map(|path| path.to_string_lossy().into_owned())
                .collect::<Vec<_>>();
            register_or_queue_open_paths(app, paths);
        }
        #[cfg(target_os = "macos")]
        RunEvent::Reopen { .. } => show_main_window(app),
        RunEvent::Exit => {
            // Quitting closes every document but must not erase the session.
            session::begin_shutdown();
            close_all_documents(app);
        }
        _ => {}
    });
}

#[cfg(test)]
mod tests {
    use super::{cli_document_paths, is_app_navigation};
    use std::path::Path;

    #[test]
    fn only_the_app_origin_may_be_navigated_to() {
        let url = |value: &str| tauri::Url::parse(value).expect("test URL should parse");
        let dev = url("http://127.0.0.1:1430/");

        assert!(is_app_navigation(&url("tauri://localhost/index.html"), None));
        assert!(is_app_navigation(&url("http://tauri.localhost/"), None));
        assert!(is_app_navigation(&url("http://127.0.0.1:1430/index.html"), Some(&dev)));
        assert!(!is_app_navigation(&url("http://127.0.0.1:1430/index.html"), None));
        assert!(!is_app_navigation(&url("https://example.com/"), Some(&dev)));
        assert!(!is_app_navigation(&url("file:///etc/passwd"), Some(&dev)));
    }

    #[test]
    fn cli_paths_filter_options_and_resolve_relative_inputs() {
        let paths = cli_document_paths(
            [
                "--ignored".to_owned(),
                "".to_owned(),
                "notes.md".to_owned(),
                "/tmp/absolute.md".to_owned(),
            ],
            Path::new("/work"),
        );

        assert_eq!(
            paths,
            vec!["/work/notes.md".to_owned(), "/tmp/absolute.md".to_owned()]
        );
    }
}
