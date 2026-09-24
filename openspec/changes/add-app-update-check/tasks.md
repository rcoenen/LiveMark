## 1. Setup
- [x] 1.1 Minisign keypair generated (`~/.tauri/livemark.key`); GitHub secrets `TAURI_SIGNING_PRIVATE_KEY` and `TAURI_SIGNING_PRIVATE_KEY_PASSWORD` configured.
- [x] 1.2 Add `tauri-plugin-updater` / `tauri-plugin-process` to `src-tauri/Cargo.toml` and `@tauri-apps/plugin-updater` / `@tauri-apps/plugin-process` to `package.json`.
- [x] 1.3 Grant `updater:default` and `process:default` in `src-tauri/capabilities/default.json` (and fix its description).
- [x] 1.4 Configure `plugins.updater` (pubkey + GitHub `latest.json` endpoint) in `tauri.conf.json` (`createUpdaterArtifacts` not needed: the packaging script tars and signs the sealed app itself).

## 2. Backend
- [x] 2.1 Register updater and process plugins in `lib.rs`.
- [x] 2.2 `install_source` command: canonical executable path → `dev` / `brew` / `direct`; Rust unit tests for the classification.
- [x] 2.3 "Check for Updates…" item in the app menu, dispatched to the renderer.

## 3. Renderer
- [x] 3.1 `updates.ts`: automatic check shortly after startup (silent on failure, skipped in dev); manual check reporting up-to-date/error states.
- [x] 3.2 Update banner UI (markup, styles, strings): direct installs get Update → download/install → relaunch; brew installs get the `brew upgrade --cask livemark` copy action and release-notes link, never a self-install.
- [x] 3.3 Vitest coverage for the per-source banner behavior.

## 4. Release pipeline
- [x] 4.1 `scripts/package-release.sh`: stage `*.app.tar.gz` + `.sig` into `dist/`, generate `latest.json`, print artifacts; document the signing env vars.
- [x] 4.2 `release-please.yml`: pass signing secrets to the packaging step; upload `app.tar.gz`, `.sig`, and `latest.json` to the release and to workflow artifacts.

## 5. Verification
- [x] 5.1 `npm test` and `npm run build`.
- [x] 5.2 `npm run dist` with signing env vars: `app.tar.gz`, `.sig`, `latest.json` produced and valid (verified in CI on the v1.5.0 release: assets published, manifest served at the updater endpoint, signature key number matches the embedded pubkey, release app launches).
- [ ] 5.3 Manual on next release: DMG copy one-click updates and relaunches; brew copy shows the brew instruction and does not self-install (needs a release *after* v1.5.0 to update into); "Check for Updates…" reports up-to-date on the current version.
