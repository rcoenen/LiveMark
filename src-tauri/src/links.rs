use percent_encoding::percent_decode_str;
use std::fs;
use std::path::{Path, PathBuf};

#[derive(Debug, PartialEq, Eq)]
pub enum LinkTarget {
    /// Opened in the default browser or mail client.
    External(String),
    /// A path on disk, relative to the linking document or absolute.
    Local(PathBuf),
    Ignored,
}

fn decode(value: &str) -> String {
    percent_decode_str(value).decode_utf8_lossy().into_owned()
}

fn without_suffix(value: &str) -> &str {
    value.split(['?', '#']).next().unwrap_or_default()
}

fn file_url_path(value: &str) -> Option<PathBuf> {
    tauri::Url::parse(value).ok()?.to_file_path().ok()
}

pub fn classify_link(href: &str) -> LinkTarget {
    let href = href.trim();
    let scheme = href
        .split_once(':')
        .map(|(scheme, _)| scheme.to_ascii_lowercase())
        .filter(|scheme| {
            scheme.len() > 1 && scheme.chars().all(|c| c.is_ascii_alphanumeric() || "+.-".contains(c))
        });

    match scheme.as_deref() {
        Some("http" | "https" | "mailto") => LinkTarget::External(href.to_owned()),
        Some("file") => file_url_path(without_suffix(href))
            .map(LinkTarget::Local)
            .unwrap_or(LinkTarget::Ignored),
        Some(_) => LinkTarget::Ignored,
        None => {
            let path = decode(without_suffix(href));
            if path.is_empty() {
                LinkTarget::Ignored
            } else {
                LinkTarget::Local(PathBuf::from(path))
            }
        }
    }
}

/// The directory tree a document may pull images from: its enclosing repository when there is one,
/// so `../assets/diagram.png` keeps working, and otherwise the document's own directory.
fn image_root(document_directory: &Path) -> PathBuf {
    document_directory
        .ancestors()
        .find(|ancestor| ancestor.join(".git").exists())
        .unwrap_or(document_directory)
        .to_owned()
}

pub fn resolve_image_path(document_path: &Path, source: &str) -> Result<PathBuf, String> {
    let source = source.trim();
    let lowered = source.to_ascii_lowercase();
    if source.is_empty()
        || lowered.starts_with("http:")
        || lowered.starts_with("https:")
        || lowered.starts_with("data:")
        || source.starts_with("//")
    {
        return Err("unsupported asset source".to_owned());
    }

    let document_directory = document_path.parent().unwrap_or_else(|| Path::new("/"));
    // A `#` or `?` can be part of a real file name, so the full source is tried before the trimmed one.
    let supplied_paths = if lowered.starts_with("file://") {
        vec![file_url_path(source), file_url_path(without_suffix(source))]
    } else {
        vec![
            Some(PathBuf::from(decode(source))),
            Some(PathBuf::from(decode(without_suffix(source)))),
        ]
    };

    let canonical = supplied_paths
        .into_iter()
        .flatten()
        .find_map(|supplied| fs::canonicalize(document_directory.join(supplied)).ok())
        .ok_or_else(|| "asset not found".to_owned())?;
    if !canonical.is_file() {
        return Err("asset is not a file".to_owned());
    }

    let root = fs::canonicalize(image_root(document_directory))
        .map_err(|_| "document directory not found".to_owned())?;
    if !canonical.starts_with(&root) {
        return Err("asset is outside the document's directory tree".to_owned());
    }
    Ok(canonical)
}

#[cfg(test)]
mod tests {
    use super::{LinkTarget, classify_link, resolve_image_path};
    use std::fs;
    use std::path::PathBuf;
    use std::sync::atomic::{AtomicUsize, Ordering};
    use std::time::{SystemTime, UNIX_EPOCH};

    static NEXT_DIRECTORY: AtomicUsize = AtomicUsize::new(0);

    fn temporary_directory() -> PathBuf {
        let unique = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .expect("clock should be after epoch")
            .as_nanos();
        let directory = std::env::temp_dir().join(format!("livemark-link-tests-{}-{unique}-{}", std::process::id(), NEXT_DIRECTORY.fetch_add(1, Ordering::Relaxed)));
        fs::create_dir_all(&directory).expect("temporary directory should be created");
        fs::canonicalize(directory).expect("temporary directory should resolve")
    }

    #[test]
    fn links_are_classified_by_scheme() {
        assert_eq!(
            classify_link("https://example.com/a?b#c"),
            LinkTarget::External("https://example.com/a?b#c".to_owned())
        );
        assert_eq!(
            classify_link("mailto:a@example.com"),
            LinkTarget::External("mailto:a@example.com".to_owned())
        );
        assert_eq!(classify_link("javascript:alert(1)"), LinkTarget::Ignored);
        assert_eq!(classify_link("#section"), LinkTarget::Ignored);
        assert_eq!(
            classify_link("docs/my%20notes.md#intro"),
            LinkTarget::Local(PathBuf::from("docs/my notes.md"))
        );
        assert_eq!(
            classify_link("file:///tmp/a%20b.md"),
            LinkTarget::Local(PathBuf::from("/tmp/a b.md"))
        );
    }

    #[test]
    fn image_paths_are_decoded_and_confined() {
        let root = temporary_directory();
        let docs = root.join("docs");
        fs::create_dir_all(&docs).expect("docs directory should be created");
        let document = docs.join("page.md");
        fs::write(&document, "# page").expect("document should be written");
        fs::write(docs.join("my image.png"), b"png").expect("image should be written");
        fs::write(docs.join("bild-ü#1.png"), b"png").expect("image should be written");
        fs::write(root.join("outside.png"), b"png").expect("image should be written");

        assert_eq!(
            resolve_image_path(&document, "my%20image.png"),
            Ok(docs.join("my image.png"))
        );
        assert_eq!(
            resolve_image_path(&document, "my%20image.png?raw=1"),
            Ok(docs.join("my image.png"))
        );
        assert_eq!(
            resolve_image_path(&document, "bild-%C3%BC%231.png"),
            Ok(docs.join("bild-ü#1.png"))
        );
        assert!(resolve_image_path(&document, "../outside.png").is_err());
        assert!(resolve_image_path(&document, "https://example.com/a.png").is_err());
        assert!(resolve_image_path(&document, "//example.com/a.png").is_err());

        // Inside a repository, sibling directories of the document are reachable.
        fs::create_dir_all(root.join(".git")).expect("repository marker should be created");
        assert_eq!(
            resolve_image_path(&document, "../outside.png"),
            Ok(root.join("outside.png"))
        );

        fs::remove_dir_all(root).expect("temporary directory should be removed");
    }
}
