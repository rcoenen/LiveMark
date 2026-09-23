## Why
LiveMark ships via GitHub Releases (DMG/zip) and a Homebrew cask, but installed copies never learn about new versions. Users stay on old builds unless they manually revisit the releases page or run `brew livecheck`.

## What Changes
- The app checks the latest GitHub Release shortly after startup and on demand via a new "Check for Updates…" app-menu item.
- A banner announces available updates with install-source-aware actions:
  - Direct DMG install → one-click download, signature verification, in-place install and relaunch via `tauri-plugin-updater`.
  - Homebrew install (Caskroom path) → instruction to run `brew upgrade --cask livemark` with a copy button; the app never self-installs, so brew stays the sole writer of the bundle.
- Release packaging publishes the signed updater artifacts (`*.app.tar.gz`, `.sig`, `latest.json`) alongside the existing DMG/zip.
- Dev builds (`tauri dev`) skip the automatic check.

## Feasibility
| Part | Verdict | Notes |
|---|---|---|
| Update check + install | Can be done | `tauri-plugin-updater` (official Tauri 2 plugin); minisign-signed artifacts, no Apple Developer ID required, works with the current ad-hoc codesigning. |
| Brew detection | Can be done | Canonicalizing the executable path resolves the brew `/Applications` symlink into `*/Caskroom/*`; pure function, unit-testable. |
| Brew/in-app conflict | Avoided by design | Brew copies are never self-updated; the cask keeps its `livecheck` and does **not** get `auto_updates true`. |
| Manifest hosting | Can be done, no server | `latest.json` attached to the GitHub Release; endpoint `releases/latest/download/latest.json`. |
| Release pipeline | Can be done | `scripts/package-release.sh` already runs in CI; `createUpdaterArtifacts` + signing env vars produce and sign the artifacts. |

## Impact
- Affected specs: `app-updates` (new)
- Affected code: `src-tauri/tauri.conf.json`, `src-tauri/Cargo.toml`, `src-tauri/capabilities/default.json`, `src-tauri/src/lib.rs`, `src-tauri/src/install_source.rs` (new), `src-tauri/src/menu.rs`, `src/renderer/updates.ts` (new), `src/renderer/renderer.ts`, `index.html`, `src/renderer/styles.css`, `src/renderer/strings.ts`, `package.json`, `scripts/package-release.sh`, `.github/workflows/release-please.yml`
- One-time manual prerequisite: minisign keypair generation and two GitHub secrets (`TAURI_SIGNING_PRIVATE_KEY`, `TAURI_SIGNING_PRIVATE_KEY_PASSWORD`).
