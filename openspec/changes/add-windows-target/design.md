# Design: Windows as a build target

## Context
LiveMark is a Tauri 2 app. Distribution today is an ad-hoc-signed arm64 DMG, a Homebrew cask, and a minisign-signed `*-update.tar.gz` referenced from `latest.json` under `darwin-aarch64`. The updater classifies an install as `dev`, `brew` (canonical executable path contains `Caskroom`), or `direct`.

The product decision is that Windows is another target of this app, not a fork. Decisions below are the ones the current tree forces on top of that.

## Goals / Non-Goals
- Goals: feature parity for live preview, tabs, open, and direct in-app update; one version; per-user NSIS; unsigned, with SmartScreen documented.
- Non-Goals: listed in `proposal.md`. A later package manager must get the same no-op-plus-instruction treatment as Homebrew before it is allowed to install a copy the updater also writes.

## Decisions

### NSIS, current user, x64 and arm64
`bundle.targets` gains `nsis` next to `app` and `dmg`. Set `bundle.windows.nsis.installMode` to `currentUser` explicitly (it is already Tauri's default) so the install lands in `%LOCALAPPDATA%\LiveMark`, writes HKCU, and does not ask for administrator. The Start Menu shortcut and uninstaller come from the NSIS template.

`bundle.fileAssociations` lists `md` and `markdown` with rank Owner. The NSIS bundler registers those for the current user, and `windows/hooks.nsh` then points both extensions at `LiveMark.Markdown` and deletes the per-user `UserChoice` keys, which otherwise keep the previous default. It remembers that previous handler and puts it back on uninstall, including after an upgrade. Opening a file launches `LiveMark.exe` with the path; `tauri-plugin-single-instance` already forwards arguments into the running process. The packaged macOS app claims the same extensions on its first launch through Launch Services and then records that claim so a later user choice stays. Development builds skip the claim. The exported UTI is `com.livemark.markdown`. A generic type such as `public.plain-text` is not claimed, so `.txt` files stay with their current app.

WebView2 uses the default `downloadBootstrapper` (silent). Windows 11 and current Windows 10 already have the runtime. The bootstrapper runs only when it is missing, and it needs a network at that moment. Embedding the bootstrapper adds about 1.8 MB and is not required for v1.

The release contains two Windows files, named by Tauri: `LiveMark_<version>_x64-setup.exe` and `LiveMark_<version>_arm64-setup.exe`. The release step renames them to `LiveMark-<version>-win-x64-setup.exe` and `LiveMark-<version>-win-arm64-setup.exe` and also writes a stable alias of each, `LiveMark-win-x64-setup.exe` and `LiveMark-win-arm64-setup.exe`, for the README download buttons. `latest.json` lists Windows as `windows-x86_64` and `windows-aarch64`, each pointing at its versioned file.

### Same updater, one manifest, two jobs
Do not set `bundle.createUpdaterArtifacts`. On Mac the packaging script tars the app after the ad-hoc `codesign`; turning the flag on would sign the unsealed bundle and race that script.

Windows signing uses the same minisign key already in `plugins.updater.pubkey`. The release job signs the NSIS executable with `tauri signer sign`. The updater accepts a raw `.exe` (`install_inner` detects an executable and runs it with `/P /UPDATE` and a relaunch). `latest.json` gets:

```json
"windows-x86_64": {
  "signature": "<minisign>",
  "url": "https://github.com/rcoenen/LiveMark/releases/download/v<version>/LiveMark-<version>-win-x64-setup.exe"
},
"windows-aarch64": {
  "signature": "<minisign>",
  "url": "https://github.com/rcoenen/LiveMark/releases/download/v<version>/LiveMark-<version>-win-arm64-setup.exe"
}
```

Mac and Windows build on different runners. Each uploads its own binaries. Only a final job writes `latest.json`, by merging the `darwin-aarch64` entry with the two Windows entries, then uploads that file with `--clobber`. The macOS job stops uploading its own `latest.json`, so a half-finished release cannot drop one platform.

`classify_path` stays as it is. A Windows path does not contain `Caskroom`, so a release build is `direct`. Debug builds stay `dev` via `debug_assertions` and skip the automatic check. No Scoop or winget variant in v1. Add a unit test that `%LOCALAPPDATA%\LiveMark\LiveMark.exe` classifies as `direct`.

The first browser download carries Mark of the Web, so SmartScreen prompts once. The updater writes the next installer itself and runs it passively; that file is not a browser download. Confirm on a real Windows machine that the passive install is not blocked. If it is, the existing failure banner already links to the release page.

### Menu, close, and title bar
`menu.rs` calls `.services()`, `.hide()`, `.hide_others()`, `.show_all()`, `.bring_all_to_front()`, and `.fullscreen()`. In Tauri 2.11 / muda 0.19 those methods compile on Windows and insert items. Services, Show All, Bring All to Front, and Fullscreen do nothing when chosen. Hide calls `ShowWindow(SW_HIDE)`. Put the macOS-only items behind `#[cfg(target_os = "macos")]`. The Windows menu keeps About, Check for Updates, Install CLI Command, and Quit.

`CloseRequested` currently cancels the close and hides the window. macOS brings it back with `RunEvent::Reopen` from the Dock. Windows has no Reopen, and a hidden window leaves no taskbar button. On Windows, do not cancel the close: the process exits, `RunEvent::Exit` still runs, and session restore on the next launch is unchanged. macOS keeps hide-on-close.

The overlay title bar is already `#[cfg(target_os = "macos")]`. The webview still reserves 43px in `.rail__titlebar` for the traffic lights, a 28px drag strip, and a Documents tab parked at `top: 48px` / `left: 78px`. On Windows the native title bar sits outside the webview, so those insets are empty chrome. Mark `html` with a platform class and drop the traffic-light inset, the extra drag strip, and the offset tab on Windows. Shortcut text that is hardcoded as `⌘` (`index.html`, `strings.ts` `rail.closeHint`) renders as Ctrl on Windows. Accelerators already use `CmdOrCtrl`, and the renderer key handler already accepts both `metaKey` and `ctrlKey`.

`Segoe UI` is already in `--font-sans` after the Apple families. No font change.

### CLI
`resources/bin/livemark` is a POSIX script that calls `open -a`. `install_cli` symlinks it to `/usr/local/bin/livemark` and falls back to `osascript`. Neither exists on Windows.

On Windows the menu command writes a `livemark.cmd` whose body starts the absolute path of the running executable, places it in a per-user directory, and appends that directory to the user PATH (`HKCU\Environment\Path`) if it is absent. Broadcast `WM_SETTINGCHANGE` so a new terminal sees it. No administrator prompt. The macOS install path stays `/usr/local/bin`.

### Path identity for the watcher
`resolve_document_path` stores `fs::canonicalize`, which on Windows is an extended path (`\\?\C:\...`). The document id is that string. `ids_for_event_paths` compares `PathBuf`s with `==`. `notify` events usually omit the `\\?\` prefix and may differ in case, so a save would not match the open document.

Normalize before compare and before using a path as a watch-map key: strip the extended prefix, and on Windows compare components case-insensitively. Keep the macOS canonical string unchanged so existing sessions still match. When an event sits in a watched parent but matches no document path, refresh the open documents in that parent. That covers editors that atomically replace the file via a temporary name. The 180ms generation coalesce stays.

### Build scripts and CI
`package.json` `build:frontend` uses `rm`, `mkdir -p`, and `cp`. npm runs that script with `cmd.exe` on Windows, so the Windows job cannot reuse it. Replace those three calls with Node `fs` operations. Leave `npm run dist` as the macOS packaging script. The Windows release step is a separate workflow command that builds `--bundles nsis` and signs the setup executable.

`ci.yml` gains `windows-latest` jobs: `npm ci`, `npm test`, `npm run build`, `tauri build --bundles nsis` (and `--target aarch64-pc-windows-msvc` for the arm64 job) without the signing secrets, then uploads the setups as Actions artifacts. Those artifacts are the real installers. The jobs do not create a GitHub Release. The macOS job stays. A pull request is enough to produce the exes; an x64 Windows machine and an ARM VM are not required before those builds run. A GUI smoke (launch, open a file, live reload, SmartScreen, updater) stays manual.

Release workflow: `build-macos`, `build-windows`, and `build-windows-arm` in parallel after release-please, then one publish job that merges `latest.json` and uploads all platforms to the same tag as a single latest release. The Homebrew cask bumps on every release. Do not tag until all bundles have been produced.

### Icons
Generate once and commit:

```bash
magick build/icon.png -define icon:auto-resize=256,128,64,48,32,16 build/icon.ico
```

CI does not need ImageMagick. Add `"../build/icon.ico"` to `bundle.icon`. That icon is the exe, the installer, the Start Menu shortcut, and the taskbar.

### README badges
The header on the GitHub README is one version badge labelled "download the dmg" plus one shields total, `github/downloads/rcoenen/LiveMark/total`. That total sums every release asset. Across the current releases it reads 50, of which 15 are DMG downloads. The rest are `latest.json` (the app polls it), checksums, signatures, zips, and `install.sh`. Adding a Windows installer to that same total would mix the two packages with those extra files.

Shields matches an asset name exactly, and our file names include the version, so a static shields URL cannot sum "every DMG" or "every setup exe". The release workflow, and a daily job on the `download-badges` branch, writes two shields endpoint files. The README points at them with `style=for-the-badge`. Counts:

- Mac: asset names ending in `.dmg`
- Windows: asset names ending in `-setup.exe`

`latest.json`, `SHA256SUMS.txt`, `.sig`, `.tar.gz`, and `install.sh` stay out of both numbers.

The version badges keep using `github/v/release` so the label tracks the latest tag without a README edit.

- Mac → `releases/latest/download/LiveMark-mac.dmg`
- Windows → `releases/latest/download/LiveMark-win-x64-setup.exe` (arm64 users pick `LiveMark-win-arm64-setup.exe`)

The publish job uploads the stable Mac DMG and the stable Windows aliases beside the versioned files. Homebrew and the updater keep the versioned files. A download of a `.dmg` counts as Mac, and a download of a `-setup.exe` counts as Windows.

## Risks / Trade-offs
- Unsigned NSIS keeps the SmartScreen prompt on first install. Accepted, same stance as the ad-hoc Mac build. An OV certificate is a later decision if the prompt becomes the problem.
- Passive updater install of an unsigned exe might still be reputation-checked. Fallback is the release-page link already in the failure banner.
- Three release jobs can publish a Mac-only or Windows-only release if one fails. The publish job uploads only when all artifact sets are present, and no tag is cut until all have built.
- A `feat:` minor bump is blocked until explicitly approved. Hold the branch locally until then.

## Migration Plan
No data migration. macOS session files keep their existing path strings. Windows sessions start empty.

Rollback is reverting the target, the workflow, and the README block. A Windows user who already installed can run the NSIS uninstaller.

## Open Questions
- None in the product decisions. Implementation waits for approval of this proposal. Merging to `main` additionally waits for an explicit yes on the minor version bump.
