# Project Context

## Purpose
LiveMark is a macOS desktop application that provides live-updating Markdown preview. When a `.md` or `.markdown` file is opened, it renders styled HTML in an Electron window and watches the file on disk — any save triggers an instant re-render. It is a read-only viewer, not an editor.

Key features:
- Live preview with instant updates on file save
- Syntax highlighting for fenced code blocks (GitHub-flavored)
- Light and dark mode via `prefers-color-scheme`
- Screen flash + "Updated" badge on each reload
- Copy always copies raw Markdown source (not rendered HTML)
- File opening via: Cmd+O, button, drag-and-drop, Finder association, or CLI
- Bundled `livemark` CLI (POSIX shell script, installable to `/usr/local/bin`)

## Tech Stack
- **Runtime:** Electron 28 (Chromium + Node.js)
- **Language:** TypeScript 5.3 (strict mode), targeting ES2022/CommonJS (main) and ES2020 (renderer)
- **Markdown:** markdown-it 14 (html: true, linkify: true, typographer: true)
- **Syntax highlighting:** highlight.js 11
- **File watching:** chokidar 3 (with `awaitWriteFinish` for write stability)
- **TS compilation:** `tsc` for main/preload, `esbuild` for renderer bundle
- **Packaging:** electron-builder 24 (produces `.app`, `.dmg`, `.zip`)
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
Classic Electron three-process model with strict separation:

1. **Main process** (`src/main/main.ts`) — Node.js context. Window lifecycle, native menus, IPC handlers, file system access via `FileWatcher`. Never touches the DOM.
2. **Preload** (`src/preload/preload.ts`) — Secure bridge via `contextBridge`. Exposes exactly four methods on `window.livemark`. `contextIsolation: true`, `nodeIntegration: false`.
3. **Renderer** (`src/renderer/renderer.ts`) — Pure browser context with zero Node access. Communicates only through `window.livemark.*`.

IPC channels:
- `markdown-update` (main → renderer): raw Markdown string
- `file-info` (main → renderer): `{ path, lastModified }`
- `open-file` (renderer → main): trigger file dialog
- `open-file-path` (renderer → main): open specific path (drag-and-drop)

### Testing Strategy
No tests currently exist. No test framework or test files are present.

### Git Workflow
- Single `main` branch
- Descriptive commit messages (e.g., `LiveMark v1.1.0 — live-updating Markdown viewer for macOS`)
- No established branching or PR conventions yet

## Domain Context
- LiveMark is a **read-only viewer** — it never writes to Markdown files
- The copy override (Cmd+C always copies raw Markdown source) is a deliberate UX decision
- File stability: chokidar `awaitWriteFinish` with `stabilityThreshold: 100ms`, `pollInterval: 50ms` to avoid partial-read races
- The `livemark` CLI is a POSIX shell script that resolves the `.app` bundle path and uses `open -a LiveMark.app <file>`
- CLI install uses `osascript` for privilege escalation when symlinking to `/usr/local/bin`
- Version is hardcoded in two places: `package.json` and `src/main/main.ts` (`setAboutPanelOptions`)

## Important Constraints
- **macOS only** — apple-specific fonts, `osascript`, `open -a` CLI pattern, LSMinimumSystemVersion 10.15 (Catalina)
- **arm64 only** distribution currently (no Intel/universal builds)
- **Security model:** `contextIsolation: true`, `nodeIntegration: false`. Renderer gets no direct Node.js access. CSP in `index.html` only allows `'self'`.
- **No network access** — the app is fully offline, no telemetry, no API calls
- **App bundle ID:** `com.livemark.app`

## External Dependencies
None — LiveMark is fully offline with no external services, APIs, or network calls. All dependencies are bundled into the application.
