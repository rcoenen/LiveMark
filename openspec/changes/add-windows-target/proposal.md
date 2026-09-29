# Change: Windows as a build target

## Why
LiveMark is the same live Markdown viewer on every machine it runs on. Today that machine can only be an Apple silicon Mac. Windows users need the same app, the same version, and the same features, built from this repository.

## What Changes
- Add a Windows x64 build target beside the existing macOS target. One `src-tauri/` tree, one frontend, one version number, one GitHub Release per tag.
- Ship a per-user NSIS installer (`LiveMark_<version>_x64-setup.exe`) that needs no administrator and no Authenticode certificate. WebView2 uses Tauri's download bootstrapper.
- Add `build/icon.ico`, generated from `build/icon.png`, and reference it from `bundle.icon`.
- Keep the Tauri updater and `latest.json`. A Windows release install is `direct` and may update itself. Homebrew installs on Mac stay instruction-only.
- Gate macOS-only menu items, overlay title-bar insets, and the POSIX `livemark` script. Windows gets a native title bar, Ctrl shortcut labels, a `livemark.cmd` installed onto the user PATH, and close-quits instead of close-hides.
- Normalize watched paths so a save still refreshes when Windows differs in drive-letter case or the `\\?\` prefix.
- Build the NSIS installer on `windows-latest` in CI and upload that x64 setup as an Actions artifact. That run does not create a GitHub Release.
- The release workflow publishes the same tag as the DMG and merges both platforms into one `latest.json`, with Windows only under `windows-x86_64`. The new release is a pre-release, so it does not become latest and the Homebrew cask stays put until the release is promoted after a Windows smoke test.
- Document both installers in the README, including the SmartScreen step. Replace the single "download the dmg" badge and the one total download counter with a Mac badge, a Windows badge, and a separate package-download count for each. The Windows package on a release is only `LiveMark_<version>_x64-setup.exe`.

## Non-goals
- A second repo, a `windows/` source tree, or a second version line.
- Microsoft Store, winget, Scoop, a portable zip, an MSI, an Authenticode or EV certificate, a custom `.md` file icon, and a second Windows installer (ARM64, 32-bit, or a stable alias of the x64 setup).
- Emulating an x64 Windows OS on a Mac, and waiting for an ARM Windows VM before CI builds the x64 setup.

## Impact
- Affected specs: `windows-target` (new). macOS Homebrew update behavior is constrained here so this change cannot turn the in-app updater back on for cask installs. The existing unarchived `app-updates` change stays the macOS write-up of that updater.
- Affected code: `src-tauri/tauri.conf.json`, `src-tauri/src/menu.rs`, `src-tauri/src/lib.rs`, `src-tauri/src/document.rs`, `src-tauri/src/install_source.rs`, `resources/bin/`, `src/renderer/styles.css`, `src/renderer/strings.ts`, `index.html`, `package.json` scripts, `scripts/package-release.sh`, `.github/workflows/ci.yml`, `.github/workflows/release-please.yml`, `README.md`, `build/icon.ico`.
- Version: this is a new capability. A `feat:` commit produces a minor bump. Do not push it or merge a release PR until that bump is explicitly approved.
