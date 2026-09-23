use std::path::{Component, Path};

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum InstallSource {
    Dev,
    Brew,
    Direct,
}

impl InstallSource {
    pub fn as_str(self) -> &'static str {
        match self {
            InstallSource::Dev => "dev",
            InstallSource::Brew => "brew",
            InstallSource::Direct => "direct",
        }
    }
}

/// Homebrew casks symlink `/Applications/LiveMark.app` into the Caskroom, so a
/// canonicalized executable path under a `Caskroom` directory is brew-managed
/// and must not be overwritten by the in-app updater.
pub fn classify_path(path: &Path) -> InstallSource {
    let brew_managed = path
        .components()
        .any(|component| matches!(component, Component::Normal(name) if name == "Caskroom"));
    if brew_managed {
        InstallSource::Brew
    } else {
        InstallSource::Direct
    }
}

pub fn current_install_source() -> InstallSource {
    if cfg!(debug_assertions) {
        return InstallSource::Dev;
    }
    let executable = std::env::current_exe()
        .ok()
        .and_then(|path| path.canonicalize().ok())
        .unwrap_or_default();
    classify_path(&executable)
}

#[tauri::command]
pub fn install_source() -> String {
    current_install_source().as_str().to_owned()
}

#[cfg(test)]
mod tests {
    use super::{InstallSource, classify_path};
    use std::path::Path;

    #[test]
    fn caskroom_paths_are_brew_managed() {
        assert_eq!(
            classify_path(Path::new("/opt/homebrew/Caskroom/livemark/1.4.3/LiveMark.app/Contents/MacOS/livemark")),
            InstallSource::Brew
        );
        assert_eq!(
            classify_path(Path::new("/usr/local/Caskroom/livemark/1.4.3/LiveMark.app/Contents/MacOS/livemark")),
            InstallSource::Brew
        );
    }

    #[test]
    fn plain_applications_installs_are_direct() {
        assert_eq!(
            classify_path(Path::new("/Applications/LiveMark.app/Contents/MacOS/livemark")),
            InstallSource::Direct
        );
        assert_eq!(
            classify_path(Path::new("/Users/alice/Applications/LiveMark.app/Contents/MacOS/livemark")),
            InstallSource::Direct
        );
    }
}
