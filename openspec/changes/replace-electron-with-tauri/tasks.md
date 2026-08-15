## 1. Baseline and Tauri Spike
- [x] 1.1 Archive or reconcile the completed `add-multi-document-tabs` change and record the Electron behavior-parity matrix.
- [x] 1.2 Record release-mode Electron `.app`, DMG, archive, cold-start, and idle-memory baselines using a documented repeatable procedure.
- [x] 1.3 Scaffold a minimal Tauri 2 arm64 application using the existing frontend assets and verify a production `.app` launches on macOS.
- [x] 1.4 Prove native menus, a multi-select Open dialog, cold and warm Finder/CLI file delivery, multi-file drag/drop, atomic-save watching, a relative local image, and DMG generation before proceeding.

## 2. Rust Desktop Backend
- [x] 2.1 Define serializable document snapshot, document ID, activation, close, and error payloads shared by Tauri commands and events.
- [x] 2.2 Implement centralized path validation and canonicalization for supported regular files from every open entry point.
- [x] 2.3 Implement the document registry, latest-snapshot bootstrap response, duplicate-open activation, window-title synchronization, and deterministic adjacent-tab activation on close.
- [x] 2.4 Implement debounced parent-directory watching that handles in-place and atomic replacement saves, shares parent watchers safely, and releases registrations on tab close, window close, and application exit.
- [x] 2.5 Implement the native application menu, including Open, Close Tab, Close Window, standard edit/view/window roles, and CLI installation feedback.
- [x] 2.6 Implement cold-launch, warm Finder, and later-process CLI file delivery through the same document-opening path.
- [x] 2.7 Add Rust unit tests for path validation, duplicate detection, registry transitions, watcher event filtering, cleanup, and command input rejection.

## 3. Secure Frontend Integration
- [x] 3.1 Add a typed Tauri adapter for command invocation, event subscription, listener cleanup, and initial document-state bootstrap.
- [x] 3.2 Replace Electron-specific drag/drop handling with Tauri webview file-drop events while retaining multi-file ordering and filtering.
- [x] 3.3 Replace direct `file://` Markdown images with a backend-controlled local-asset URL/protocol and test traversal, encoding, spaces, Unicode, nested paths, and unsupported resources.
- [x] 3.4 Define a least-privilege Tauri capability manifest and CSP that expose only the required desktop operations and do not grant the renderer general filesystem or shell access.
- [x] 3.5 Verify that the renderer build contains no Electron imports and that tabs, themes, Markdown rendering, syntax highlighting, update feedback, scrolling, keyboard navigation, and selection-aware copy remain unchanged.
- [x] 3.6 Display the runtime package version next to the LiveMark toolbar title and verify it updates from the single package version source.

## 4. Packaging and Distribution
- [x] 4.1 Configure the product name, version source, bundle ID, icons, arm64 target, macOS minimum, file associations, CLI resource, and `.app`/DMG/archive bundles in Tauri.
- [x] 4.2 Replace electron-builder scripts with deterministic Tauri development, test, build, and distribution scripts.
- [x] 4.3 Update CI to install the Rust toolchain and macOS prerequisites, cache Rust and Node dependencies, run frontend and Rust tests, and build the application on macOS.
- [x] 4.4 Update release automation to ad-hoc sign and verify the Tauri app, verify the DMG, generate checksums, preserve public release filenames, and upload the expected assets.
- [x] 4.5 Verify the bundled CLI, in-app CLI installer, curl installer, and Homebrew cask against a locally packaged release and a draft GitHub Release.
- [x] 4.6 Update README development/distribution instructions and `openspec/project.md` to describe the Tauri architecture, prerequisites, security boundary, and version source.

## 5. Parity and Migration Verification
- [x] 5.1 Run the complete open-path matrix for single and multiple files: cold CLI launch, warm CLI launch, cold Finder launch, warm Finder launch, Open dialog, and drag/drop.
- [x] 5.2 Verify duplicate focus, independent foreground/background updates, atomic saves, tab closing, adjacent activation, watcher cleanup, window recreation, application quit, and empty-state behavior.
- [x] 5.3 Verify representative Markdown, raw HTML, fenced code, local images, light/dark themes, theme persistence after the first Tauri launch, selection-aware copy, accessibility roles, and keyboard shortcuts on supported macOS versions.
- [x] 5.4 Compare release-mode artifact size, cold start, and idle memory with the recorded Electron baseline and document the results.
- [x] 5.5 Inspect the packaged app to confirm it contains no Electron Framework, bundled Chromium, Node.js runtime, Electron main/preload output, or Electron production dependency.

## 6. Electron Removal and Final Validation
- [x] 6.1 Remove Electron main/preload sources, Electron type declarations, chokidar, Electron/electron-builder dependencies, and obsolete build output only after Sections 1–5 pass.
- [x] 6.2 Run frontend build/tests, `cargo test`, a clean Tauri arm64 build, signature verification, DMG verification, installer/cask smoke tests, and `openspec validate replace-electron-with-tauri --strict`.
- [x] 6.3 Confirm every task and acceptance scenario is complete, then mark this checklist complete before requesting archive.
