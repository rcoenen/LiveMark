mod document;
mod menu;

use crate::document::{DocumentRegistry, DocumentSnapshot, load_snapshot, resolve_document_path};
use crate::menu::{
    MENU_CLOSE_TAB, MENU_CLOSE_WINDOW, MENU_FORCE_RELOAD, MENU_INSTALL_CLI, MENU_OPEN, MENU_RELOAD,
    MENU_RESET_ZOOM, MENU_TOGGLE_DEVTOOLS, MENU_ZOOM_IN, MENU_ZOOM_OUT, build_menu,
};
use base64::Engine;
use notify::{Event, RecommendedWatcher, RecursiveMode, Watcher};
use serde::Serialize;
use std::collections::HashMap;
use std::fs;
use std::path::{Path, PathBuf};
use std::process::Command;
use std::sync::Mutex;
use std::thread;
use std::time::Duration;
use tauri::menu::MenuEvent;
use tauri::{AppHandle, Emitter, Manager, RunEvent, State, Wry};
use tauri_plugin_dialog::{DialogExt, MessageDialogKind};

const MAIN_WINDOW_LABEL: &str = "main";
const WATCH_STABILITY_DELAY: Duration = Duration::from_millis(120);
const CLI_INSTALL_PATH: &str = "/usr/local/bin/livemark";

#[derive(Default)]
struct RuntimeData {
    registry: DocumentRegistry,
    watched_directories: HashMap<PathBuf, usize>,
    refresh_generations: HashMap<String, u64>,
}

struct RuntimeState {
    data: Mutex<RuntimeData>,
    watcher: Mutex<RecommendedWatcher>,
    zoom: Mutex<f64>,
}

#[derive(Default)]
struct PendingOpenPaths(Mutex<Vec<String>>);

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct BootstrapState {
    documents: Vec<DocumentSnapshot>,
    active_document_id: Option<String>,
    version: String,
}

#[derive(Clone, Serialize)]
struct DocumentIdPayload {
    id: String,
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

fn emit_activation(app: &AppHandle<Wry>, document_id: &str) {
    let payload = DocumentIdPayload {
        id: document_id.to_owned(),
    };
    if let Err(error) = app.emit_to(MAIN_WINDOW_LABEL, "document-activated", payload) {
        eprintln!("could not emit document activation: {error}");
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
    Ok(())
}

fn register_paths(app: &AppHandle<Wry>, paths: Vec<String>, cwd: &Path) {
    for path in paths {
        if let Err(error) = register_document(app, &path, cwd) {
            eprintln!("could not open document {path}: {error}");
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

    let snapshot = match load_snapshot(&path) {
        Ok(snapshot) => snapshot,
        Err(error) => {
            eprintln!("could not refresh {}: {error}", path.display());
            return;
        }
    };

    let changed = {
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
        data.registry.update(snapshot.clone())
    };

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
) -> Result<String, String> {
    let document_path = {
        let state = app.state::<RuntimeState>();
        let data = state.data.lock().map_err(|_| lock_error("runtime data"))?;
        data.registry
            .path(document_id)
            .ok_or_else(|| "document is not open".to_owned())?
    };

    let source_without_suffix = source.split(['?', '#']).next().unwrap_or_default();
    if source_without_suffix.is_empty()
        || source_without_suffix.starts_with("http:")
        || source_without_suffix.starts_with("https:")
        || source_without_suffix.starts_with("data:")
    {
        return Err("unsupported asset source".to_owned());
    }

    let supplied_path = if source_without_suffix.starts_with("file://") {
        let file_url = match tauri::Url::parse(source_without_suffix) {
            Ok(url) => url,
            Err(_) => return Err("invalid file URL".to_owned()),
        };
        match file_url.to_file_path() {
            Ok(path) => path,
            Err(_) => return Err("invalid file URL".to_owned()),
        }
    } else {
        PathBuf::from(source_without_suffix)
    };
    let candidate = if supplied_path.is_absolute() {
        supplied_path
    } else {
        document_path
            .parent()
            .unwrap_or_else(|| Path::new("/"))
            .join(supplied_path)
    };
    let canonical = fs::canonicalize(&candidate).map_err(|_| "asset not found".to_owned())?;
    if !canonical.is_file() {
        return Err("asset is not a file".to_owned());
    }

    let mime = mime_guess::from_path(&canonical).first_or_octet_stream();
    if mime.type_() != mime_guess::mime::IMAGE {
        return Err("asset is not an image".to_owned());
    }
    let bytes = fs::read(&canonical).map_err(|_| "asset could not be read".to_owned())?;
    let encoded = base64::engine::general_purpose::STANDARD.encode(bytes);
    Ok(format!("data:{};base64,{encoded}", mime.essence_str()))
}

#[tauri::command]
fn resolve_local_image(
    app: AppHandle<Wry>,
    document_id: String,
    source: String,
) -> Result<String, String> {
    read_local_image(&app, &document_id, &source)
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
        MENU_RESET_ZOOM | MENU_ZOOM_IN | MENU_ZOOM_OUT => {
            let state = app.state::<RuntimeState>();
            if let Ok(mut zoom) = state.zoom.lock() {
                *zoom = match event.id().as_ref() {
                    MENU_RESET_ZOOM => 1.0,
                    MENU_ZOOM_IN => (*zoom + 0.1).min(3.0),
                    MENU_ZOOM_OUT => (*zoom - 0.1).max(0.5),
                    _ => *zoom,
                };
                if let Some(window) = app.get_webview_window(MAIN_WINDOW_LABEL) {
                    let _ = window.set_zoom(*zoom);
                }
            }
        }
        _ => {}
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
        .invoke_handler(tauri::generate_handler![
            bootstrap,
            open_file_dialog,
            open_file_paths,
            activate_document,
            close_document,
            resolve_local_image
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
                zoom: Mutex::new(1.0),
            });
            app.set_menu(build_menu(app)?)?;

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
        RunEvent::Exit => close_all_documents(app),
        _ => {}
    });
}

#[cfg(test)]
mod tests {
    use super::cli_document_paths;
    use std::path::Path;

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
