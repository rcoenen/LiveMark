# Design: App Update Check

## Decisions

**`tauri-plugin-updater` over a hand-rolled checker.** The official plugin gives signed downloads, in-place install, and relaunch. Its minisign verification works with the project's ad-hoc codesigning; an Apple Developer ID is not required, unlike Electron's `electron-updater` on macOS.

**GitHub Release as the only channel.** `latest.json` and `*.app.tar.gz{,.sig}` are attached to the same release that already carries the DMG/zip. Endpoint: `https://github.com/rcoenen/LiveMark/releases/latest/download/latest.json`. No update server, no new hosting.

**One writer per install type.** Brew copies live in the Caskroom behind a symlink; a self-install would corrupt that and fight `brew upgrade`. Detection: canonicalize `std::env::current_exe()` — brew's `/Applications/LiveMark.app` symlink resolves into `*/Caskroom/*`. Brew copies get instructions only, and the cask deliberately keeps no `auto_updates true` flag so `brew upgrade` remains their update path.

**Key management.** The minisign private key lives outside the repo (`~/.tauri/livemark.key` locally, GitHub secrets in CI). The public key is embedded in `tauri.conf.json`. Losing the private key means cutting a release with a new keypair; existing installs then fail verification and fall back to the release-page link — an acceptable recovery story for this project's scale.

**Renderer drives the flow.** `check()` / `downloadAndInstall()` run from the webview via the plugin's JS API so the banner can show progress and per-source actions; Rust only provides the `install_source` classification and plugin registration.

## Alternatives considered

- **Notify + download link only** — smaller change, but the user chose the one-click flow; remains the documented fallback behavior when install fails.
- **Sparkle / Squirrel-style frameworks** — macOS-native but foreign to the Tauri stack and would need an appcast server.
