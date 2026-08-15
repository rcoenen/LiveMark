# Change: Replace Electron with Tauri

## Why
LiveMark currently ships a bundled Chromium and Node.js runtime for a small macOS-only viewer, producing an approximately 226 MB application and 93 MB DMG in the current 1.3.0 build. The project also depends on Electron 28, which is end-of-life and requires a substantial upgrade before it can receive current runtime security fixes.

LiveMark's browser UI is already framework-free and its privileged desktop surface is limited to window lifecycle, menus, file dialogs, file watching, filesystem reads, and file-open events. Moving that surface to Tauri 2 can remove the bundled browser runtime while retaining the existing renderer and user experience.

## What Changes
- **BREAKING (development/runtime):** Replace Electron, electron-builder, the Electron main process, and the preload IPC bridge with Tauri 2 and a Rust backend.
- Keep the existing HTML, CSS, Markdown rendering, syntax highlighting, tabs, themes, update feedback, and copy behavior in the webview frontend.
- Display the package version next to the LiveMark name in the application toolbar without hardcoding a separate renderer version.
- Introduce a narrow frontend adapter over Tauri commands and events so the renderer does not receive general filesystem or shell access.
- Move document registration, canonicalization, filesystem reads, watcher lifecycle, window title updates, and native menu actions into Rust.
- Preserve all existing file-open entry points: Finder associations, application launch arguments, an already-running application, the native Open dialog, drag and drop, and the bundled `livemark` CLI.
- Replace direct `file://` image URLs with a backend-controlled local-asset mechanism suitable for Tauri's security model.
- Replace Electron packaging with Tauri `.app`, DMG, and archive generation while retaining the product name, bundle identifier, Apple-silicon target, CLI resource, GitHub Release, installer, and Homebrew workflows.
- Declare macOS 11 as the effective minimum because the distribution is arm64-only and Apple-silicon macOS starts with Big Sur.
- Add automated backend tests and a macOS behavior-parity smoke-test matrix before removing the Electron implementation.

## Impact
- Affected specs: `desktop-runtime` (new capability)
- Related unchanged specs: `copy-behavior`, `theme-toggle`, and the completed but unarchived `add-multi-document-tabs` change
- Affected code: `package.json`, `package-lock.json`, `tsconfig.json`, `index.html`, `src/main/**`, `src/preload/**`, `src/renderer/**`, `src/types.d.ts`, new `src-tauri/**`, `.github/workflows/**`, `resources/bin/livemark`, `scripts/install.sh`, `Casks/livemark.rb`, `README.md`, and `openspec/project.md`
- Build requirements: Rust toolchain and the macOS Tauri prerequisites become required for desktop builds; Node.js remains required for the TypeScript frontend build
- Distribution: artifact generation changes internally, but release asset names and installation entry points remain compatible
- User data: no document data is migrated because LiveMark is read-only; the locally stored theme preference may reset once because Electron and WKWebView use different web-storage origins
- Coordination: archive or otherwise reconcile `add-multi-document-tabs` before archiving this change so its capability becomes part of the baseline specs
