# Project Context

## Purpose
LiveMark is a macOS desktop application that provides live-updating Markdown preview. When a supported text file is opened, it renders styled HTML in a Tauri webview and watches the file on disk — any save triggers an instant re-render. It is a read-only viewer, not an editor.

Key features:
- Live preview with instant updates on file save
- Syntax highlighting for fenced code blocks (GitHub-flavored)
- Light and dark mode via `prefers-color-scheme`
- Screen flash + "Updated" badge on each reload
- Copy always copies raw Markdown source (not rendered HTML)
- File opening via: Cmd+O, button, drag-and-drop, Finder association, or CLI
- Bundled `livemark` CLI (POSIX shell script, installable to `/usr/local/bin`)

## Tech Stack
- **Runtime:** Tauri 2 using the native macOS WebView
- **Backend:** Rust stable with Tauri commands/events and `notify` file watching
- **Frontend:** TypeScript 5.3 (strict mode), targeting Safari 13.1+
- **Markdown:** markdown-it 15 (html: true, linkify: true, typographer: true)
- **Syntax highlighting:** highlight.js 11
- **File watching:** notify 8 with application-level debounce and fresh reads
- **Compilation:** `tsc --noEmit`, esbuild for the renderer, Cargo for Rust
- **Packaging:** Tauri CLI plus a release script that produces an ad-hoc-signed `.app`, `.dmg`, and `.zip`
- **CSS:** Plain CSS with custom properties (no preprocessor or framework)
- **Shell:** POSIX sh for the CLI helper script
- **No web framework** — renderer uses plain TypeScript with the DOM API directly

## Project Conventions

### Code Style
- TypeScript strict mode enabled
- Explicit return type annotations on all functions
- Classes use explicit `private`/`public` access modifiers
- `null` for unset object references (e.g., `let mainWindow: BrowserWindow | null = null`); not mixed with `undefined`
- Named callback types via `type` aliases; `interface` for data shapes
- `async/await` for async operations
- No linter or formatter config (no ESLint, no Prettier) — consistency is manual
- CSS uses BEM-adjacent class names (`empty-state`, `open-file-btn`, `update-notification`)
- CSS custom properties for theming (`--bg-color`, `--text-color`, etc.)
- Fonts: `-apple-system, BlinkMacSystemFont` for body; `'SF Mono', Menlo, Monaco, monospace` for code

### Architecture Patterns
Two-layer Tauri architecture with a narrow security boundary:

1. **Rust backend** (`src-tauri/src/`) — owns document state, path validation, filesystem reads and watches, native menus/dialogs, single-instance forwarding, window lifecycle, and local-image resolution.
2. **Renderer** (`src/renderer/`) — a pure browser TypeScript application. Its typed platform adapter uses only the registered Tauri commands/events and native webview drag/drop events.

The renderer has no shell or general filesystem capability. Local images are read by a backend command only in the context of an already-open document and returned as image data URLs. The CSP blocks scripts and limits other resource types.

### Testing Strategy
Rust unit tests cover path validation and document registry behavior. CI runs TypeScript validation/frontend bundling, `cargo check`, unit tests, and a Tauri application build on Apple silicon macOS.

### Git Workflow
- Single `main` branch
- Descriptive commit messages (e.g., `LiveMark v1.1.0 — live-updating Markdown viewer for macOS`)
- No established branching or PR conventions yet

## Domain Context
- LiveMark is a **read-only viewer** — it never writes to Markdown files
- The copy override (Cmd+C copies Markdown source, not rendered HTML) is a deliberate UX decision. Table separator rows are normalized to `| :---- |` so Google Docs Paste from Markdown keeps the table
- File stability: parent-directory watching plus generation-based debounce handles both in-place writes and atomic file replacement
- The `livemark` CLI is a POSIX shell script that resolves the `.app` bundle path and uses `open -a LiveMark.app <file>`
- CLI install uses `osascript` for privilege escalation when symlinking to `/usr/local/bin`
- `package.json` is the release version source; Tauri reads it directly and Release Please mirrors it to `src-tauri/Cargo.toml`

## Important Constraints
- **macOS only** — Apple-specific fonts, `osascript`, and the `open -a` CLI pattern; arm64 distribution requires macOS 11 (Big Sur) or newer
- **arm64 only** distribution currently (no Intel/universal builds)
- **Security model:** least-privilege Tauri capabilities, registered application commands, no shell plugin, no general filesystem plugin, and a restrictive CSP
- **No network access by the app itself** — no telemetry, no API calls. The only network requests are remote `http(s)` images referenced by a document, and links the user opens in their browser
- **App bundle ID:** `com.livemark.app`

## External Dependencies
None — LiveMark uses no external services or APIs, and all dependencies are bundled into the application. Documents may reference remote images, which the webview loads.
