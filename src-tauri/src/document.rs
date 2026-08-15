use serde::Serialize;
use std::collections::HashMap;
use std::fs;
use std::path::{Path, PathBuf};
use std::time::UNIX_EPOCH;

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
                    .any(|event_path| event_path == &record.path)
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

pub fn load_snapshot(path: &Path) -> Result<DocumentSnapshot, String> {
    let content = fs::read_to_string(path)
        .map_err(|error| format!("could not read {} as UTF-8: {error}", path.display()))?;
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

#[cfg(test)]
mod tests {
    use super::{DocumentRegistry, DocumentSnapshot, load_snapshot, resolve_document_path};
    use std::fs;
    use std::path::PathBuf;
    use std::time::{SystemTime, UNIX_EPOCH};

    fn snapshot(id: &str, content: &str) -> DocumentSnapshot {
        DocumentSnapshot {
            id: id.to_owned(),
            path: id.to_owned(),
            content: content.to_owned(),
            last_modified: 1,
        }
    }

    fn temporary_directory() -> PathBuf {
        let unique = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .expect("clock should be after epoch")
            .as_nanos();
        let directory = std::env::temp_dir().join(format!("livemark-tests-{unique}"));
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
}
