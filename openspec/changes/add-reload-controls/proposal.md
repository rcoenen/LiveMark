## Why
`update-window-layout-and-reload-feedback` shipped three of the six status states from the mockups (3b) and a flat reload log. Missing: pausing reloads while reading, a visible state when the watched file disappears, and the reload-history popover with its settings (3c).

## What Changes
- Pause / resume live reload per document; while paused the newest snapshot is held and the status block reads "Paused · N changes waiting" with "Load now".
- "File not found" state: the last version stays on screen with its time; "Locate" re-points the document at a new path. The document recovers by itself if the file reappears at the same path.
- Clicking the status block opens a reload-history popover: entries since the document was opened, blocks per reload, "on screen now / still on screen / no longer in document", step through with ⌘⇧N, "Clear marks".
- Settings in the popover, persisted in localStorage: mark changed blocks (on), marks fade after 8s (on), notify on every reload (off, the default = no reload toast; on = a toast for every reload, including background documents).

## Feasibility
| Part | Verdict | Notes |
|---|---|---|
| Pause / Load now | Can be done, renderer only | Backend keeps emitting; renderer holds the latest snapshot per paused document. Scroll position is untouched because nothing re-renders. |
| File not found | Can be done, small backend change | `refresh_document` (`src-tauri/src/lib.rs:230`) currently only `eprintln!`s a failed read. Emit a `document-missing` event instead. The watcher is on the parent directory, so a file that reappears at the same path already triggers a refresh. |
| Locate | Can be done, medium | Document id is the canonical path (`document.rs:174`), so relocating means close + open under a new id; the renderer carries `updateCount`, `reloads` and `openedAt` over. Needs a `relocate_document` command using the existing dialog plugin. |
| Follow a renamed file automatically | Cannot be done reliably | macOS FSEvents does not pair rename-from/rename-to dependably through `notify`; and a rename out of the watched directory is invisible. Manual "Locate" is the supported path. |
| History popover, Clear marks, settings | Can be done, renderer only | Requires keeping `changedKeys` per reload instead of only for the newest one. |
| Stepping to an older reload | Partly | Only blocks that still exist unchanged can be located; older blocks rewritten since are reported as "no longer in document". |
| Showing previous text (diff) | Deliberately not done | Technically possible (the renderer holds the old content at reload time) but the design excludes it: the count counts reloads, not lines. |
| OS-level notifications | Not in this change | Would need `tauri-plugin-notification` plus a macOS permission prompt; the in-app toast covers the mockup. |

## Impact
- Affected specs: `live-reload-feedback` (added requirements; depends on `update-window-layout-and-reload-feedback`)
- Affected code: `src/renderer/renderer.ts`, `src/renderer/platform.ts`, `src/renderer/styles.css`, `index.html`, `src-tauri/src/lib.rs`, `src-tauri/src/document.rs`
