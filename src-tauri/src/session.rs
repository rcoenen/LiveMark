use serde::{Deserialize, Serialize};
use std::fs;
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicBool, Ordering};

/// While the app shuts down, close_all_documents empties the registry without
/// meaning "the user closed these" — session writes must not record that.
static SHUTTING_DOWN: AtomicBool = AtomicBool::new(false);

pub fn begin_shutdown() {
    SHUTTING_DOWN.store(true, Ordering::SeqCst);
}

fn shutting_down() -> bool {
    SHUTTING_DOWN.load(Ordering::SeqCst)
}

#[derive(Clone, Debug, Default, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SessionState {
    /// Document ids (canonical paths) in rail order.
    pub documents: Vec<String>,
    pub active_document_id: Option<String>,
}

pub fn read_session(path: &Path) -> SessionState {
    let Ok(contents) = fs::read_to_string(path) else {
        return SessionState::default();
    };
    serde_json::from_str(&contents).unwrap_or_default()
}

pub fn write_session(path: &Path, session: &SessionState) -> Result<(), String> {
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).map_err(|error| format!("could not create session directory: {error}"))?;
    }
    let contents = serde_json::to_string(session).map_err(|error| format!("could not encode session: {error}"))?;
    fs::write(path, contents).map_err(|error| format!("could not write session: {error}"))
}

pub fn session_file(app_data_dir: PathBuf) -> PathBuf {
    app_data_dir.join("session.json")
}

/// Records the current registry unless a shutdown is in progress; failures are
/// logged, never fatal.
pub fn persist(app_data_dir: &Path, session: &SessionState) {
    if shutting_down() {
        return;
    }
    if let Err(error) = write_session(&session_file(app_data_dir.to_path_buf()), session) {
        eprintln!("could not persist session: {error}");
    }
}

#[cfg(test)]
mod tests {
    use super::{SessionState, read_session, write_session};
    use std::fs;

    #[test]
    fn session_round_trips() {
        let path = std::env::temp_dir().join(format!("livemark-session-{}.json", std::process::id()));
        let session = SessionState {
            documents: vec!["/tmp/a.md".to_owned(), "/tmp/b.md".to_owned()],
            active_document_id: Some("/tmp/b.md".to_owned()),
        };
        write_session(&path, &session).expect("session should be written");
        assert_eq!(read_session(&path), session);
        let _ = fs::remove_file(&path);
    }

    #[test]
    fn missing_or_corrupt_session_reads_as_empty() {
        let path = std::env::temp_dir().join(format!("livemark-session-missing-{}.json", std::process::id()));
        assert_eq!(read_session(&path), SessionState::default());
        fs::write(&path, "{not json").expect("corrupt session fixture should be written");
        assert_eq!(read_session(&path), SessionState::default());
        let _ = fs::remove_file(&path);
    }
}
