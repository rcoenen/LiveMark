## Why
Mockup 2c: on a wide window two documents can be read side by side, each at its own fixed measure, instead of leaving the surplus width to a margin column.

## What Changes
- Optional two-pane mode; each pane shows one document with a slim header (name, modified time, close).
- Rail tabs show an L / R badge for documents that are in a pane; a document is sent to a pane by dragging it there or via "Open in left/right pane".
- Each pane keeps its own scroll position, reload marks and reading-position anchoring. The margin column is hidden in two-pane mode.
- Copy, ⌘⇧N and the status block follow the focused pane.

## Feasibility
| Part | Verdict | Notes |
|---|---|---|
| Two panes rendering | Can be done, large refactor | `renderer.ts` assumes one `#content`, window-level scrolling (`window.scrollY`, `window.scrollTo`), one set of mark/status timers and one active document. All of that must become pane-scoped with per-pane scroll containers. See `design.md`. |
| Backend | No change required | The backend's single "active document" only drives the window title; panes can stay a renderer concept. Title follows the focused pane through the existing `activate_document`. |
| Drag from rail to pane | Uncertain | HTML5 drag-and-drop inside a Tauri webview conflicts with `dragDropEnabled: true` (needed for file drops from Finder) on some platforms; must be verified on macOS WKWebView. The menu/button path does not depend on it. |
| Synced scrolling between panes | Not in this change | Only meaningful for two versions of the same document; no such concept exists. |
| More than two panes | Not planned | The fixed measure does not leave room on common displays. |

Recommendation: schedule last. It touches every renderer function that the three other open changes also modify.

## Impact
- Affected specs: `split-panes` (new); `window-layout` behaviour of the margin column in two-pane mode
- Depends on: `update-window-layout-and-reload-feedback`, `add-reload-controls`
- Affected code: `src/renderer/renderer.ts` (restructure), `src/renderer/styles.css`, `index.html`
