use serde::Serialize;
use std::collections::HashMap;
use std::fs;
use std::path::{Path, PathBuf};
use std::time::UNIX_EPOCH;

/// `\\?\` and `\\?\UNC\` are a Windows `canonicalize` artifact. Stored document
/// ids and path comparisons use the path without that prefix.
pub fn simplify_extended_path(path: &Path) -> PathBuf {
    let text = path.to_string_lossy();
    let stripped = if let Some(rest) = text.strip_prefix(r"\\?\UNC\") {
        format!(r"\\{rest}")
    } else if let Some(rest) = text.strip_prefix(r"\\?\") {
        rest.to_owned()
    } else {
        return path.to_path_buf();
    };
    PathBuf::from(stripped)
}

pub fn paths_refer_to_same_file(left: &Path, right: &Path) -> bool {
    paths_equal(left, right, cfg!(windows))
}

fn paths_equal(left: &Path, right: &Path, ignore_ascii_case: bool) -> bool {
    let left = simplify_extended_path(left);
    let right = simplify_extended_path(right);
    if !ignore_ascii_case {
        return left == right;
    }
    let fold = |path: PathBuf| {
        path.components()
            .map(|component| component.as_os_str().to_string_lossy().to_ascii_lowercase())
            .collect::<Vec<_>>()
    };
    fold(left) == fold(right)
}

const SUPPORTED_EXTENSIONS: [&str; 3] = ["md", "markdown", "txt"];

#[derive(Clone, Debug, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DocumentSnapshot {
    pub id: String,
    pub path: String,
    pub content: String,
    pub last_modified: u64,
}

#[derive(Debug)]
struct DocumentRecord {
    path: PathBuf,
    latest: DocumentSnapshot,
}

#[derive(Debug)]
pub struct CloseOutcome {
    pub closed_id: String,
    pub closed_path: PathBuf,
    pub active_id: Option<String>,
}

#[derive(Default, Debug)]
pub struct DocumentRegistry {
    documents: HashMap<String, DocumentRecord>,
    order: Vec<String>,
    active_id: Option<String>,
}

impl DocumentRegistry {
    pub fn contains(&self, document_id: &str) -> bool {
        self.documents.contains_key(document_id)
    }

    pub fn insert(&mut self, path: PathBuf, snapshot: DocumentSnapshot) {
        let document_id = snapshot.id.clone();
        self.documents.insert(
            document_id.clone(),
            DocumentRecord {
                path,
                latest: snapshot,
            },
        );
        self.order.push(document_id.clone());
        self.active_id = Some(document_id);
    }

    pub fn activate(&mut self, document_id: &str) -> bool {
        if !self.documents.contains_key(document_id) {
            return false;
        }

        self.active_id = Some(document_id.to_owned());
        true
    }

    pub fn close(&mut self, document_id: &str) -> Option<CloseOutcome> {
        let closing_index = self.order.iter().position(|id| id == document_id)?;
        let record = self.documents.remove(document_id)?;
        self.order.remove(closing_index);

        if self.active_id.as_deref() == Some(document_id) {
            self.active_id = if self.order.is_empty() {
                None
            } else {
                Some(self.order[closing_index.min(self.order.len() - 1)].clone())
            };
        }

        Some(CloseOutcome {
            closed_id: document_id.to_owned(),
            closed_path: record.path,
            active_id: self.active_id.clone(),
        })
    }

    pub fn update(&mut self, snapshot: DocumentSnapshot) -> bool {
        let Some(record) = self.documents.get_mut(&snapshot.id) else {
            return false;
        };

        if record.latest == snapshot {
            return false;
        }

        record.latest = snapshot;
        true
    }

    /// Puts `document_id` at the tab position of `anchor_id`, which a relocated document takes over.
    pub fn move_before(&mut self, document_id: &str, anchor_id: &str) {
        let Some(from) = self.order.iter().position(|id| id == document_id) else {
            return;
        };
        let moved = self.order.remove(from);
        let to = self
            .order
            .iter()
            .position(|id| id == anchor_id)
            .unwrap_or(self.order.len());
        self.order.insert(to, moved);
    }

    pub fn snapshots(&self) -> Vec<DocumentSnapshot> {
        self.order
            .iter()
            .filter_map(|id| self.documents.get(id))
            .map(|record| record.latest.clone())
            .collect()
    }

    pub fn active_id(&self) -> Option<String> {
        self.active_id.clone()
    }

    pub fn path(&self, document_id: &str) -> Option<PathBuf> {
        self.documents
            .get(document_id)
            .map(|record| record.path.clone())
    }

    pub fn ids(&self) -> Vec<String> {
        self.order.clone()
    }

    pub fn ids_for_event_paths(&self, event_paths: &[PathBuf]) -> Vec<String> {
        self.order
            .iter()
            .filter_map(|id| {
                let record = self.documents.get(id)?;
                event_paths
                    .iter()
                    .any(|event_path| paths_refer_to_same_file(event_path, &record.path))
                    .then(|| id.clone())
            })
            .collect()
    }

    /// Open documents that live in the same directory as an event path.
    /// Windows editors often emit the temporary name from an atomic save, not the document path.
    /// macOS matches the event path exactly, so this fallback is only called on Windows.
    #[cfg_attr(not(target_os = "windows"), allow(dead_code))]
    pub fn ids_sharing_parent_with(&self, event_paths: &[PathBuf]) -> Vec<String> {
        self.order
            .iter()
            .filter_map(|id| {
                let record = self.documents.get(id)?;
                let parent = record.path.parent()?;
                event_paths
                    .iter()
                    .any(|event_path| {
                        event_path.parent().is_some_and(|event_parent| {
                            paths_refer_to_same_file(event_parent, parent)
                        }) || paths_refer_to_same_file(event_path, parent)
                    })
                    .then(|| id.clone())
            })
            .collect()
    }
}

pub fn resolve_document_path(input: &str, cwd: &Path) -> Result<PathBuf, String> {
    if input.is_empty() || input.starts_with('-') {
        return Err("empty paths and command options are not documents".to_owned());
    }

    let supplied_path = Path::new(input);
    let absolute_path = if supplied_path.is_absolute() {
        supplied_path.to_owned()
    } else {
        cwd.join(supplied_path)
    };

    let canonical_path = fs::canonicalize(&absolute_path)
        .map(|path| simplify_extended_path(&path))
        .map_err(|error| format!("could not resolve {}: {error}", absolute_path.display()))?;
    let metadata = fs::metadata(&canonical_path)
        .map_err(|error| format!("could not inspect {}: {error}", canonical_path.display()))?;

    if !metadata.is_file() {
        return Err(format!(
            "{} is not a regular file",
            canonical_path.display()
        ));
    }

    let extension = canonical_path
        .extension()
        .and_then(|extension| extension.to_str())
        .map(str::to_ascii_lowercase)
        .unwrap_or_default();

    if !SUPPORTED_EXTENSIONS.contains(&extension.as_str()) {
        return Err(format!(
            "{} is not a supported Markdown or text file",
            canonical_path.display()
        ));
    }

    Ok(canonical_path)
}

/// Markdown files that sit next to open documents, for the Go to File palette. Not recursive.
pub fn list_markdown_files(directories: &[PathBuf]) -> Vec<String> {
    let mut files = directories
        .iter()
        .filter_map(|directory| fs::read_dir(directory).ok())
        .flat_map(|entries| entries.filter_map(Result::ok))
        .map(|entry| entry.path())
        .filter(|path| {
            path.extension()
                .and_then(|extension| extension.to_str())
                .map(str::to_ascii_lowercase)
                .is_some_and(|extension| extension == "md" || extension == "markdown")
                && path.is_file()
        })
        .map(|path| path.to_string_lossy().into_owned())
        .collect::<Vec<_>>();
    files.sort();
    files.dedup();
    files
}

pub fn load_snapshot(path: &Path) -> Result<DocumentSnapshot, String> {
    let content = fs::read_to_string(path)
        .map_err(|error| format!("could not read {} as UTF-8: {error}", path.display()))?;
    let content = content
        .strip_prefix('\u{feff}')
        .map(str::to_owned)
        .unwrap_or(content);
    let metadata = fs::metadata(path)
        .map_err(|error| format!("could not inspect {}: {error}", path.display()))?;
    let modified = metadata.modified().map_err(|error| {
        format!(
            "could not read modification time for {}: {error}",
            path.display()
        )
    })?;
    let last_modified = modified
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis() as u64;
    let display_path = path.to_string_lossy().into_owned();

    Ok(DocumentSnapshot {
        id: display_path.clone(),
        path: display_path,
        content,
        last_modified,
    })
}

/// Why a guarded write did not happen.
#[derive(Debug, PartialEq, Eq)]
pub enum WriteError {
    /// The file no longer holds what LiveMark last read; someone else changed it.
    Conflict,
    Io(String),
}

impl std::fmt::Display for WriteError {
    fn fmt(&self, formatter: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            WriteError::Conflict => write!(formatter, "conflict: the file changed on disk"),
            WriteError::Io(message) => write!(formatter, "{message}"),
        }
    }
}

const BYTE_ORDER_MARK: &[u8] = &[0xef, 0xbb, 0xbf];

/// Replaces a document only while it still holds `expected`, the text LiveMark last read (after any byte
/// order mark, which is kept). The new bytes go to a temporary file beside the target and are moved over it,
/// so readers never see a half-written file. A symbolic link stays a link: the file it points to is replaced.
pub fn write_if_unchanged(path: &Path, expected: &str, content: &str) -> Result<(), WriteError> {
    let target = fs::canonicalize(path).map_err(|error| WriteError::Io(format!("could not resolve {}: {error}", path.display())))?;
    let current = fs::read(&target).map_err(|error| WriteError::Io(format!("could not read {}: {error}", target.display())))?;
    let (bom, text) = match current.strip_prefix(BYTE_ORDER_MARK) {
        Some(rest) => (BYTE_ORDER_MARK, rest),
        None => (&[][..], current.as_slice()),
    };
    if text != expected.as_bytes() {
        return Err(WriteError::Conflict);
    }

    let file_name = target
        .file_name()
        .map(|name| name.to_string_lossy().into_owned())
        .unwrap_or_else(|| "document".to_owned());
    let unique = std::time::SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_nanos();
    let temporary = target.with_file_name(format!(".{file_name}.livemark-{}-{unique}.tmp", std::process::id()));
    let result = (|| -> std::io::Result<()> {
        use std::io::Write;
        let mut file = fs::File::create(&temporary)?;
        file.write_all(bom)?;
        file.write_all(content.as_bytes())?;
        file.sync_all()?;
        if let Ok(metadata) = fs::metadata(&target) {
            fs::set_permissions(&temporary, metadata.permissions())?;
        }
        fs::rename(&temporary, &target)
    })();
    if let Err(error) = result {
        let _ = fs::remove_file(&temporary);
        return Err(WriteError::Io(format!("could not write {}: {error}", target.display())));
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::{
        DocumentRegistry, DocumentSnapshot, WriteError, list_markdown_files, load_snapshot, resolve_document_path,
        write_if_unchanged,
    };
    use std::fs;
    use std::path::{Path, PathBuf};
    use std::sync::atomic::{AtomicUsize, Ordering};
    use std::time::{SystemTime, UNIX_EPOCH};

    fn snapshot(id: &str, content: &str) -> DocumentSnapshot {
        DocumentSnapshot {
            id: id.to_owned(),
            path: id.to_owned(),
            content: content.to_owned(),
            last_modified: 1,
        }
    }

    static NEXT_DIRECTORY: AtomicUsize = AtomicUsize::new(0);

    fn temporary_directory() -> PathBuf {
        let unique = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .expect("clock should be after epoch")
            .as_nanos();
        let directory = std::env::temp_dir().join(format!("livemark-tests-{}-{unique}-{}", std::process::id(), NEXT_DIRECTORY.fetch_add(1, Ordering::Relaxed)));
        fs::create_dir_all(&directory).expect("temporary directory should be created");
        directory
    }

    #[test]
    fn registry_preserves_order_and_activates_adjacent_document() {
        let mut registry = DocumentRegistry::default();
        registry.insert(PathBuf::from("/a.md"), snapshot("/a.md", "a"));
        registry.insert(PathBuf::from("/b.md"), snapshot("/b.md", "b"));
        registry.insert(PathBuf::from("/c.md"), snapshot("/c.md", "c"));
        assert!(registry.activate("/b.md"));

        let outcome = registry.close("/b.md").expect("document should close");

        assert_eq!(outcome.active_id.as_deref(), Some("/c.md"));
        assert_eq!(
            registry
                .snapshots()
                .iter()
                .map(|item| item.id.as_str())
                .collect::<Vec<_>>(),
            vec!["/a.md", "/c.md"]
        );
    }

    #[test]
    fn relocated_document_takes_over_the_tab_position() {
        let mut registry = DocumentRegistry::default();
        registry.insert(PathBuf::from("/a.md"), snapshot("/a.md", "a"));
        registry.insert(PathBuf::from("/b.md"), snapshot("/b.md", "b"));
        registry.insert(PathBuf::from("/moved.md"), snapshot("/moved.md", "a"));

        registry.move_before("/moved.md", "/a.md");
        registry.close("/a.md").expect("document should close");

        assert_eq!(registry.ids(), vec!["/moved.md".to_owned(), "/b.md".to_owned()]);
    }

    #[test]
    fn closing_inactive_document_keeps_active_document() {
        let mut registry = DocumentRegistry::default();
        registry.insert(PathBuf::from("/a.md"), snapshot("/a.md", "a"));
        registry.insert(PathBuf::from("/b.md"), snapshot("/b.md", "b"));

        let outcome = registry.close("/a.md").expect("document should close");

        assert_eq!(outcome.active_id.as_deref(), Some("/b.md"));
    }

    #[test]
    fn unchanged_snapshot_is_not_reported_as_an_update() {
        let mut registry = DocumentRegistry::default();
        registry.insert(PathBuf::from("/a.md"), snapshot("/a.md", "a"));

        assert!(!registry.update(snapshot("/a.md", "a")));
        assert!(registry.update(snapshot("/a.md", "changed")));
    }

    #[test]
    fn watcher_event_paths_match_only_open_documents_in_tab_order() {
        let mut registry = DocumentRegistry::default();
        registry.insert(PathBuf::from("/a.md"), snapshot("/a.md", "a"));
        registry.insert(PathBuf::from("/b.md"), snapshot("/b.md", "b"));

        assert_eq!(
            registry.ids_for_event_paths(&[
                PathBuf::from("/unrelated.md"),
                PathBuf::from("/b.md"),
                PathBuf::from("/a.md"),
            ]),
            vec!["/a.md", "/b.md"]
        );
        assert!(registry.ids_for_event_paths(&[]).is_empty());
    }

    #[test]
    fn extended_windows_prefixes_match_the_plain_path() {
        let stored = PathBuf::from(r"C:\Docs\Notes.md");
        assert_eq!(
            super::simplify_extended_path(Path::new(r"\\?\C:\Docs\Notes.md")),
            stored
        );
        assert_eq!(
            super::simplify_extended_path(Path::new(r"\\?\UNC\server\share\Notes.md")),
            PathBuf::from(r"\\server\share\Notes.md")
        );
        assert!(super::paths_equal(
            Path::new(r"\\?\C:\Docs\Notes.md"),
            Path::new(r"C:\Docs\Notes.md"),
            false
        ));
        assert!(super::paths_equal(
            Path::new(r"C:\Docs\Notes.md"),
            Path::new(r"c:\docs\notes.md"),
            true
        ));
        assert!(!super::paths_equal(
            Path::new(r"C:\Docs\Notes.md"),
            Path::new(r"c:\docs\notes.md"),
            false
        ));
    }

    #[test]
    fn watcher_events_match_across_extended_prefixes() {
        let mut registry = DocumentRegistry::default();
        registry.insert(
            PathBuf::from(r"C:\Docs\Notes.md"),
            snapshot(r"C:\Docs\Notes.md", "a"),
        );

        assert_eq!(
            registry.ids_for_event_paths(&[PathBuf::from(r"\\?\C:\Docs\Notes.md")]),
            vec![r"C:\Docs\Notes.md"]
        );
    }

    #[test]
    fn sibling_events_refresh_open_documents_in_that_directory() {
        let mut registry = DocumentRegistry::default();
        registry.insert(
            PathBuf::from("C:/Docs/Notes.md"),
            snapshot("C:/Docs/Notes.md", "a"),
        );
        registry.insert(
            PathBuf::from("C:/Other/Other.md"),
            snapshot("C:/Other/Other.md", "b"),
        );

        assert_eq!(
            registry.ids_sharing_parent_with(&[PathBuf::from("C:/Docs/Notes.md.tmp")]),
            vec!["C:/Docs/Notes.md"]
        );
    }

    #[test]
    fn sibling_listing_is_flat_and_limited_to_markdown() {
        let directory = temporary_directory();
        fs::create_dir_all(directory.join("nested")).expect("nested directory should be created");
        for name in ["b.md", "a.markdown", "notes.txt", "image.png", "nested/deep.md"] {
            fs::write(directory.join(name), "x").expect("file should be written");
        }

        let files = list_markdown_files(&[directory.clone(), directory.join("does-not-exist")]);

        assert_eq!(
            files,
            vec![
                directory.join("a.markdown").to_string_lossy().into_owned(),
                directory.join("b.md").to_string_lossy().into_owned(),
            ]
        );
        fs::remove_dir_all(directory).expect("temporary directory should be removed");
    }

    #[test]
    fn byte_order_mark_is_stripped_from_loaded_content() {
        let directory = temporary_directory();
        let path = directory.join("bom.md");
        fs::write(&path, "\u{feff}# Title").expect("document should be written");

        let snapshot = load_snapshot(&path).expect("document should load");

        assert_eq!(snapshot.content, "# Title");
        fs::remove_dir_all(directory).expect("temporary directory should be removed");
    }

    #[test]
    fn path_validation_accepts_supported_regular_files() {
        let directory = temporary_directory();
        let file = directory.join("example.md");
        fs::write(&file, "# Example").expect("fixture should be written");

        let resolved =
            resolve_document_path("example.md", &directory).expect("path should resolve");
        let loaded = load_snapshot(&resolved).expect("snapshot should load");

        assert_eq!(loaded.content, "# Example");
        assert!(loaded.path.ends_with("example.md"));
        fs::remove_dir_all(directory).expect("fixture should be removed");
    }

    #[test]
    fn path_validation_rejects_directories_and_extensions() {
        let directory = temporary_directory();
        let unsupported = directory.join("example.json");
        fs::write(&unsupported, "{}").expect("fixture should be written");

        assert!(resolve_document_path(directory.to_string_lossy().as_ref(), &directory).is_err());
        assert!(resolve_document_path(unsupported.to_string_lossy().as_ref(), &directory).is_err());
        fs::remove_dir_all(directory).expect("fixture should be removed");
    }

    #[test]
    fn guarded_write_replaces_only_an_unchanged_file_and_keeps_its_byte_order_mark() {
        let directory = temporary_directory();
        let path = directory.join("notes.md");
        fs::write(&path, b"\xef\xbb\xbfHello\r\n").expect("fixture should be written");

        assert_eq!(write_if_unchanged(&path, "Changed\r\n", "x"), Err(WriteError::Conflict));
        assert_eq!(fs::read(&path).expect("file should exist"), b"\xef\xbb\xbfHello\r\n");

        write_if_unchanged(&path, "Hello\r\n", "Hello\r\n\r\n<!--livemark:comments\r\n{}\r\n-->\r\n").expect("write should succeed");
        assert_eq!(
            fs::read(&path).expect("file should exist"),
            b"\xef\xbb\xbfHello\r\n\r\n<!--livemark:comments\r\n{}\r\n-->\r\n"
        );
        let leftovers = fs::read_dir(&directory).expect("directory should be readable").count();
        assert_eq!(leftovers, 1, "no temporary file may be left behind");
    }

    #[cfg(unix)]
    #[test]
    fn guarded_write_through_a_symbolic_link_keeps_the_link() {
        let directory = temporary_directory();
        let real = directory.join("real.md");
        let link = directory.join("link.md");
        fs::write(&real, "A\n").expect("fixture should be written");
        std::os::unix::fs::symlink(&real, &link).expect("link should be created");
        write_if_unchanged(&link, "A\n", "B\n").expect("write should succeed");
        assert!(fs::symlink_metadata(&link).expect("link should exist").file_type().is_symlink());
        assert_eq!(fs::read_to_string(&real).expect("target should exist"), "B\n");
    }
}
