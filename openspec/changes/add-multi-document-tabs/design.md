## Context
LiveMark currently stores a single `BrowserWindow` and a single `FileWatcher` in the main process. The renderer also stores one set of document fields (`rawMarkdown`, file directory, update count, and first-load state). Supporting multiple live documents requires document identity and lifecycle to cross the main, preload, and renderer boundaries.

The chosen interaction model is one LiveMark window with a tab for each document. A Finder double-click while LiveMark is running adds and activates a tab in that window.

## Goals / Non-Goals
- Goals:
  - Keep multiple Markdown documents open and independently watched.
  - Make every supported file-open entry point behave consistently.
  - Prevent duplicate tabs and duplicate watchers for the same file.
  - Keep document-specific renderer state isolated.
  - Retain the current Electron security boundary.
- Non-Goals:
  - Multiple LiveMark windows.
  - Editing or saving Markdown.
  - Restoring tabs across application restarts.
  - Reordering, pinning, or detaching tabs.

## Decisions
- Decision: The main process owns a registry keyed by canonical absolute file path. Each entry owns one `FileWatcher`, and the canonical path also supplies stable document identity for IPC.
  - Rationale: File access remains outside the renderer, and duplicate opens can be detected at the point where watchers are created.
- Decision: Main-to-renderer messages carry complete document-scoped payloads rather than relying on paired unscoped `markdown-update` and `file-info` events.
  - Rationale: A single scoped payload cannot accidentally combine content from one file with metadata from another.
- Decision: The renderer owns presentation state for each document, including update count and scroll position, while the main process owns file and watcher lifecycle.
  - Rationale: UI-only state stays in the browser context, and filesystem state stays in the main process.
- Decision: Opening an already-open canonical path activates its existing tab.
  - Rationale: Duplicate tabs would be visually ambiguous and would waste watcher resources.
- Decision: Finder requests received before readiness are stored in an ordered queue instead of a single pending slot.
  - Rationale: macOS may deliver several `open-file` events during launch.
- Decision: Closing the final tab returns to the existing empty state; it does not close the application window.
  - Rationale: This preserves the current reusable viewer window and makes it easy to open another file.
- Decision: The theme toggle lives in a persistent application toolbar above the tab strip, while file-specific metadata lives below the tab strip.
  - Rationale: The visual hierarchy distinguishes global application state from the active document's state.

## Risks / Trade-offs
- Background file changes can arrive while another tab is active. Document IDs on every payload and per-document renderer state prevent cross-document rendering.
- Canonicalization can fail if a file disappears between the open event and registry creation. The app will reject that open request without disturbing existing documents.
- A larger number of open documents means a matching number of filesystem watchers. Closing a tab immediately releases its watcher, and application shutdown releases all remaining watchers.
- The renderer currently has an uncommitted user edit. Implementation must preserve that edit while restructuring the file.

## Migration Plan
1. Introduce the document registry and scoped IPC contract.
2. Add the renderer document store and tab UI.
3. Route all existing open entry points through the registry.
4. Verify the one-document case before testing multi-document behavior.

Rollback consists of restoring the singleton watcher and unscoped renderer events; no persistent data migration is required.

## Open Questions
- None.
