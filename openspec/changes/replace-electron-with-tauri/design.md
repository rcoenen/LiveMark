## Context
LiveMark is an Apple-silicon macOS viewer built as a classic Electron application. The Electron main process owns the window, native menus, file-open lifecycle, document registry, file reads, and chokidar watchers. A context-isolated preload exposes document-specific operations and events to a plain TypeScript renderer.

The renderer is already portable browser code except for its dependency on `window.livemark` and Electron's non-standard `File.path` drag-and-drop property. This makes the shell replaceable without rewriting the presentation layer. The migration is still cross-cutting because it changes the process boundary, watcher implementation, security permissions, packaging, CI, release assets, native application events, and local-file URL handling.

The completed `add-multi-document-tabs` change is the behavioral baseline. This proposal changes how that behavior is hosted, not the one-window/many-tabs interaction model.

## Goals / Non-Goals
- Goals:
  - Remove Electron, electron-builder, bundled Chromium, and the Electron preload from production artifacts.
  - Preserve the current user-visible behavior and all supported file-open paths.
  - Keep the renderer isolated from unrestricted filesystem and shell access.
  - Make file watching reliable for both in-place writes and atomic replace-on-save patterns.
  - Preserve the current application identity and distribution channels.
  - Produce materially smaller application and download artifacts and record the before/after measurements.
- Non-Goals:
  - Rewriting the renderer in Rust or adopting a frontend framework.
  - Adding editing, multiple windows, session restoration, auto-update, telemetry, or network services.
  - Expanding distribution beyond macOS arm64.
  - Changing the current ad-hoc signing/notarization policy.
  - Redesigning tabs, themes, Markdown rendering, copy behavior, or the CLI command syntax.
  - Hardening or sanitizing raw HTML in Markdown beyond preserving an equivalent CSP; that requires a separate behavior and security proposal.

## Decisions

### Use Tauri 2 with a Rust-owned desktop boundary
The application SHALL use Tauri 2 and the system WKWebView. A small Rust backend will own native and filesystem behavior; Node.js dependencies remain build-time or bundled frontend libraries only.

Alternatives considered:
- Upgrade Electron in place. This has the lowest immediate rewrite cost but preserves the large bundled runtime and recurring Chromium/Node major-upgrade burden.
- Build a native SwiftUI application. This could produce the most native result but would require rewriting the entire renderer and reproducing the JavaScript Markdown ecosystem.
- Keep both shells indefinitely. This doubles integration and release maintenance without serving a supported second platform.

### Preserve a narrow renderer adapter
The frontend will use a small platform adapter that presents the document operations currently used by `window.livemark`, backed by Tauri `invoke` calls and typed event listeners. The rest of the renderer remains unaware of Rust and Tauri.

Listener registration will happen before an initial state query. After listeners are installed, the frontend will invoke a bootstrap command that returns all open document snapshots and the active document ID. This avoids losing Finder or CLI open events that arrive before the webview is ready.

Commands will cover request/response operations such as opening a dialog, opening paths, activating a document, and closing a document. Backend-to-frontend events will carry complete document-scoped snapshots for updates and lifecycle changes.

### Keep document and watcher lifecycle in Rust
Rust application state will own a registry keyed by canonical absolute path. Every open document has one logical watch registration and a latest snapshot. Duplicate opens activate the existing record rather than creating another tab or registration.

The watch service will observe parent directories and map relevant events back to registered documents. This is more resilient than observing only the original inode when an editor saves by renaming a temporary file over the document. Events will be debounced until the write is stable, followed by a fresh read and metadata query. Closing a tab removes its logical registration; a parent-directory watcher is stopped when it has no remaining registrations.

Shared state and watcher callbacks must not hold a lock while reading a file or emitting to the webview. Backend errors will be logged and represented as non-destructive open/update failures rather than panics.

### Handle every native open path explicitly
Tauri's application lifecycle and file-association configuration will handle files supplied at cold launch and by Finder while the application is running. A single-instance integration will forward file arguments from later CLI launches to the existing process. The native Open dialog will retain multi-selection. Tauri's webview drag/drop event will supply filesystem paths instead of relying on Electron's `File.path` extension.

All paths will pass through the same canonicalization, supported-extension, regular-file, duplicate-detection, and registration function regardless of their source.

### Serve local images through a controlled asset boundary
The renderer will no longer construct `file://` URLs. Markdown image references will be converted to a Tauri-compatible local asset URL or custom protocol request containing document context. Rust will resolve and canonicalize the referenced path relative to the open document, reject unsupported URL schemes and non-image resources, and return only approved local image content.

The renderer will not receive a general filesystem API. The Tauri capability manifest will grant only the commands and events required by the main webview. The CSP will continue to block executable inline content, remote scripts, arbitrary connections, and navigation outside the packaged application.

### Preserve application and distribution identity
Tauri configuration will retain `LiveMark`, bundle ID `com.livemark.app`, the existing icons, Markdown file associations, and arm64-only builds. The declared minimum will be macOS 11, matching the Mach-O deployment target and the first macOS release that supports Apple silicon; the previous 10.15 metadata was not achievable for an arm64-only binary. The bundled CLI will remain at the resource location expected by the in-app installer and Homebrew cask when Tauri allows that layout; otherwise all three consumers will be updated together.

The release workflow will build the frontend, run Rust tests, create the Tauri app and DMG/archive, apply and verify the existing ad-hoc signature, verify the DMG, generate SHA-256 checksums, and publish assets using the current public filenames. The curl installer and cask must install the Tauri release without changing their user-facing commands.

### Remove Electron only after parity verification
The Tauri shell will be developed alongside the Electron shell long enough to complete the spike and behavior matrix. Electron dependencies and source files will be removed only after a packaged Tauri build passes the acceptance checks. Production packages will never contain both runtimes.

## Risks / Trade-offs
- WKWebView can render HTML or CSS differently from Chromium and its feature set follows the installed macOS version. Test the actual Markdown corpus, code highlighting, scrolling, selection, keyboard shortcuts, themes, and accessibility on supported macOS versions.
- Native file-open delivery differs between cold launch, an already-running process, Finder, and CLI invocation. Centralized path handling plus cold/warm launch tests mitigate lost or duplicated documents.
- Atomic saves can replace the watched inode. Watching parent directories and re-reading by canonical path mitigates stale registrations.
- Tauri capabilities and local-asset scopes can accidentally become too broad. Keep filesystem access in Rust, allowlist the frontend commands, validate every path server-side, and add traversal/unsupported-resource tests.
- A custom asset protocol can change relative-image behavior. Test spaces, Unicode, fragments, URL-encoded paths, nested directories, and `..` segments against the Electron baseline.
- Electron localStorage and WKWebView storage are not expected to share an origin. The theme may return to its default once after upgrade, but Tauri must persist later changes across restarts.
- Rust introduces a second language and toolchain. Keep the backend small, use conventional Tauri patterns, and document setup and release commands.
- Existing release automation assumes electron-builder output paths and names. Preserve public artifact names and test the installer and cask against a draft release before publishing.

## Migration Plan
1. Record the Electron baseline: behavior matrix, app/DMG/archive sizes, launch behavior, and representative Markdown rendering screenshots.
2. Scaffold Tauri 2 and prove a packaged arm64 window, native menu, file dialog, Finder open, warm single-instance open, drag/drop, watcher update, relative image, and DMG build.
3. Implement the Rust registry, watcher service, command/event contract, native menu, CLI installer action, and local-asset boundary with automated tests.
4. Switch the existing renderer to the Tauri adapter and complete behavior-parity verification while Electron remains available for comparison.
5. Update packaging, CI, release automation, installer, cask, documentation, and OpenSpec project context.
6. Remove Electron, electron-builder, preload/main TypeScript, chokidar, and obsolete build configuration only after the packaged Tauri artifact passes all gates.
7. Publish the first Tauri version as a normal application update with release notes calling out the smaller runtime and possible one-time theme reset.

Rollback before release is to restore the Electron entry point and packaging scripts while retaining renderer fixes that are runtime-neutral. Rollback after release is to republish or direct users to the last Electron DMG; there is no document data migration to reverse. Keep the bundle ID and CLI path stable so either version can replace the other.

## Open Questions
- None. Exact Rust crate versions will be selected and locked during implementation without changing these architectural decisions.
