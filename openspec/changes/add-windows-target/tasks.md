## 1. Skeleton
- [x] 1.1 Make `build:frontend` portable: replace `rm`, `mkdir -p`, and `cp` with Node `fs` so `npm test` runs under `cmd.exe`.
- [x] 1.2 Generate `build/icon.ico` from `build/icon.png` and add it to `bundle.icon`.
- [x] 1.3 Add the `nsis` bundle target, `bundle.windows.nsis.installMode: currentUser`, and the download-bootstrapper WebView2 mode.
- [x] 1.4 Gate Services, Hide, Hide Others, Show All, Bring All to Front, and Fullscreen behind `#[cfg(target_os = "macos")]`.
- [x] 1.5 On Windows, let the close button quit. Keep hide-on-close and Dock reopen on macOS.
- [x] 1.6 Drop the traffic-light inset, extra drag strip, and Documents-tab offset on Windows. Show Ctrl in shortcut labels.
- [x] 1.7 Add a `windows-latest` CI job that runs `npm test`, `npm run build`, and `tauri build --bundles nsis`.

## 2. Behavior
- [x] 2.1 Normalize watch paths (extended prefix, Windows case) and refresh sibling documents when an event hits a watched parent but no exact path. Unit tests. macOS path strings unchanged.
- [x] 2.2 Windows Install CLI Command: write `livemark.cmd` pointing at the running exe, add its directory to the user PATH, no administrator prompt. Leave the macOS symlink path as it is.
- [x] 2.3 Confirm NSIS registers the existing `.md` / `.markdown` associations and that a second launch focuses the running instance.
- [x] 2.4 Unit test: a `%LOCALAPPDATA%\LiveMark\...exe` path classifies as `direct`. Dev builds still skip the automatic update check.

## 3. Release
- [x] 3.1 Windows release step signs `LiveMark_<version>_x64-setup.exe` with the existing minisign key.
- [x] 3.2 Publish job merges `darwin-aarch64` and `windows-x86_64` into one `latest.json` and uploads it once. The macOS job no longer uploads its own manifest.
- [x] 3.3 README install sections for Mac and Windows, including the SmartScreen step. Neutralize "for macOS" in the bundle copyright and package description.
- [x] 3.3a Header badges: "download mac" and "download windows" version badges, linking to stable asset names `LiveMark-mac.dmg` and `LiveMark-windows-setup.exe`. Upload those names next to the versioned installers.
- [x] 3.3b Replace the single total download badge. Publish shields endpoint JSON on branch `download-badges` (on release and daily) that counts `.dmg` assets as Mac and `-setup.exe` assets as Windows.
- [ ] 3.4 Manual smoke on Windows: install without admin, open a file, live reload after an editor save, tabs, CLI, and a direct update. Confirm the Mac cask still shows the Homebrew command and does not self-install.
- [x] 3.5 Update `openspec/project.md` so it describes both targets.
- [ ] 3.6 Do not push a `feat:` commit or merge a release PR until the minor version bump is explicitly approved.

## 4. Verification on the Mac tree
- [x] 4.1 `npm test` and `npm run build` on macOS after the `cfg` and script changes.
- [ ] 4.2 macOS close still hides, and the Dock reopens the window.
